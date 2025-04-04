import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import cors from 'cors';
import type { DefaultEventsMap, Socket as IOSocket } from 'socket.io';
import { Server as IOServer } from 'socket.io';

import { logger } from '../logger';

import { Lobby, MatchType } from './Lobby';
import Socket from '../socket';
import * as env from '../env';
import type { Deck } from '../utils/deck/Deck';
import type { CardDataGetter } from '../utils/cardData/CardDataGetter';
import * as Contract from '../game/core/utils/Contract';
import { RemoteCardDataGetter } from '../utils/cardData/RemoteCardDataGetter';
import { DeckValidator } from '../utils/deck/DeckValidator';
import { SwuGameFormat } from '../SwuGameFormat';
import type { ISwuDbDecklist } from '../utils/deck/DeckInterfaces';
import QueueHandler from './QueueHandler';

/**
 * Represents a user object
 */
interface User {
    id: string;
    username: string;
}

/**
 * Represents additional Socket types we can leverage these later.
 */

interface SocketData {
    manualDisconnect?: boolean;
}

/**
 * Represents a player waiting in the queue.
 */
interface IQueuedPlayer {
    deck: Deck;
    socket?: Socket;
    user: User;
}

enum UserRole {
    Player = 'player',
    Spectator = 'spectator'
}

interface ILobbyMapping {
    lobbyId: string;
    role: UserRole;
}

export class GameServer {
    public static async createAsync(): Promise<GameServer> {
        let cardDataGetter: CardDataGetter;
        let testGameBuilder: any = null;

        if (process.env.ENVIRONMENT === 'development') {
            testGameBuilder = this.getTestGameBuilder();

            cardDataGetter = process.env.FORCE_REMOTE_CARD_DATA === 'true'
                ? await GameServer.buildRemoteCardDataGetter()
                : testGameBuilder.cardDataGetter;
        } else {
            cardDataGetter = await GameServer.buildRemoteCardDataGetter();
        }

        return new GameServer(
            cardDataGetter,
            await DeckValidator.createAsync(cardDataGetter),
            testGameBuilder
        );
    }

    private static buildRemoteCardDataGetter(): Promise<RemoteCardDataGetter> {
        // TODO: move this url to a config
        return RemoteCardDataGetter.createAsync('https://karabast-assets.s3.amazonaws.com/data/');
    }

    private static getTestGameBuilder() {
        const testDirPath = path.resolve(__dirname, '../../test');
        const gameStateBuilderPath = path.resolve(__dirname, '../../test/helpers/GameStateBuilder.js');

        Contract.assertTrue(fs.existsSync(testDirPath), `Test data directory not found at ${testDirPath}, please run 'npm run get-cards'`);
        Contract.assertTrue(fs.existsSync(gameStateBuilderPath), `Test tools file not found at ${gameStateBuilderPath}`);

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const gameStateBuilderClass = require(gameStateBuilderPath);
        return new gameStateBuilderClass();
    }

    private readonly lobbies = new Map<string, Lobby>();
    private readonly userLobbyMap = new Map<string, ILobbyMapping>();
    private readonly io: IOServer;
    private readonly cardDataGetter: CardDataGetter;
    private readonly deckValidator: DeckValidator;
    private readonly testGameBuilder?: any;
    private readonly queue: QueueHandler = new QueueHandler();
    private constructor(
        cardDataGetter: CardDataGetter,
        deckValidator: DeckValidator,
        testGameBuilder?: any
    ) {
        const app = express();
        app.use(express.json());
        const server = http.createServer(app);

        const corsOptions = {
            origin: ['http://localhost:3000', 'https://karabast.net', 'https://www.karabast.net'],
            methods: ['GET', 'POST'],
            credentials: true, // Allow cookies or authorization headers
        };
        app.use(cors(corsOptions));

        this.setupAppRoutes(app);
        app.use((err, req, res, next) => {
            logger.error('GameServer: Error in API route:', err);
            res.status(err.status || 500).json({
                success: false,
                error: err.message || 'Server error.',
            });
        });

        server.listen(env.gameNodeSocketIoPort);
        logger.info(`GameServer: listening on port ${env.gameNodeSocketIoPort}`);

        // Setup socket server
        this.io = new IOServer(server, {
            perMessageDeflate: false,
            path: '/ws',
            cors: {
                origin: ['http://localhost:3000', 'https://karabast.net', 'https://www.karabast.net'],
                methods: ['GET', 'POST']
            }
        });

        // Currently for IOSockets we can use DefaultEventsMap but later we can customize these.
        this.io.on('connection', async (socket: IOSocket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>) => {
            try {
                await this.onConnection(socket);
                socket.on('manualDisconnect', () => {
                    socket.data.manualDisconnect = true;
                    socket.disconnect();
                });
            } catch (err) {
                logger.error('GameServer: Error in socket connection:', err);
            }
        });

        this.cardDataGetter = cardDataGetter;
        this.testGameBuilder = testGameBuilder;
        this.deckValidator = deckValidator;
    }

    private setupAppRoutes(app: express.Application) {
        app.get('/api/get-unimplemented', (req, res, next) => {
            try {
                return res.json(this.deckValidator.getUnimplementedCards());
            } catch (err) {
                logger.error('GameServer: Error in setupAppRoutes:', err);
                next(err);
            }
        });

        app.post('/api/spectate-game', (req, res, next) => {
            try {
                const { gameId, user } = req.body;
                const lobby = this.lobbies.get(gameId);
                // if they are in a game already we give them 403 forbidden
                if (!this.canUserJoinNewLobby(user.id)) {
                    return res.status(403).json({
                        success: false,
                        message: 'User is already in a game'
                    });
                }
                if (!lobby || !lobby.hasOngoingGame() || lobby.isPrivate) {
                    return res.status(404).json({
                        success: false,
                        message: 'Game not found or does not allow spectators'
                    });
                }

                // Register this user as a spectator for the game
                this.userLobbyMap.set(user.id, { lobbyId: lobby.id, role: UserRole.Spectator });
                return res.status(200).json({ success: true });
            } catch (err) {
                logger.error('GameServer: Error in spectate-game:', err);
                next(err);
            }
        });

        app.get('/api/ongoing-games', (_, res, next) => {
            try {
                return res.json(this.getOngoingGamesData());
            } catch (err) {
                logger.error('GameServer: Error in ongoing-games:', err);
                next(err);
            }
        });

        app.post('/api/create-lobby', async (req, res, next) => {
            try {
                const { user, deck, format, isPrivate, lobbyName } = req.body;
                // Check if the user is already in a lobby
                const userId = typeof user === 'string' ? user : user.id;
                if (!this.canUserJoinNewLobby(userId)) {
                    return res.status(403).json({
                        success: false,
                        message: 'User is already in a lobby'
                    });
                }
                await this.processDeckValidation(deck, format, res, async () => {
                    await this.createLobby(lobbyName, user, deck, format, isPrivate);
                    res.status(200).json({ success: true });
                });
            } catch (err) {
                logger.error('GameServer: Error in create lobby:', err);
                next(err);
            }
        });

        app.get('/api/available-lobbies', (_, res, next) => {
            try {
                const availableLobbies = Array.from(this.lobbiesWithOpenSeat().entries()).map(([id, lobby]) => ({
                    id,
                    name: lobby.name,
                    format: lobby.format,
                }));
                return res.json(availableLobbies);
            } catch (err) {
                logger.error('GameServer: Error in available-lobbies:', err);
                next(err);
            }
        });

        app.post('/api/join-lobby', (req, res, next) => {
            try {
                const { lobbyId, user } = req.body;

                const userId = typeof user === 'string' ? user : user.id;
                if (!this.canUserJoinNewLobby(userId)) {
                    return res.status(403).json({
                        success: false,
                        message: 'User is already in a lobby'
                    });
                }

                const lobby = this.lobbies.get(lobbyId);
                if (!lobby) {
                    return res.status(404).json({ success: false, message: 'Lobby not found' });
                }

                if (lobby.isFilled()) {
                    return res.status(400).json({ success: false, message: 'Lobby is full' });
                }

                // Add the user to the lobby
                this.userLobbyMap.set(user.id, { lobbyId: lobby.id, role: UserRole.Player });
                return res.status(200).json({ success: true });
            } catch (err) {
                logger.error('GameServer: Error in join-lobby:', err);
                next(err);
            }
        });

        app.get('/api/test-game-setups', (_, res, next) => {
            try {
                const testSetupFilenames = this.getTestSetupGames();
                return res.json(testSetupFilenames);
            } catch (err) {
                logger.error('GameServer: Error in test-game=setups:', err);
                next(err);
            }
        });

        app.post('/api/start-test-game', async (req, res, next) => {
            const { filename } = req.body;
            try {
                await this.startTestGame(filename);
                return res.status(200).json({ success: true });
            } catch (err) {
                logger.error('GameServer: Error in start-test=game:', err);
                next(err);
            }
        });

        app.post('/api/enter-queue', async (req, res, next) => {
            try {
                const { format, user, deck } = req.body;
                // check if user is already in a lobby
                const userId = typeof user === 'string' ? user : user.id;
                if (!this.canUserJoinNewLobby(userId)) {
                    return res.status(403).json({
                        success: false,
                        message: 'User is already in a lobby'
                    });
                }
                await this.processDeckValidation(deck, format, res, () => {
                    const success = this.enterQueue(format, user, deck);
                    if (!success) {
                        return res.status(400).json({ success: false, message: 'Failed to enter queue' });
                    }
                    res.status(200).json({ success: true });
                });
            } catch (err) {
                logger.error('GameServer: Error in enter-queue:', err);
                next(err);
            }
        });

        app.get('/api/health', (_, res, next) => {
            try {
                return res.status(200).json({ success: true });
            } catch (err) {
                logger.error('GameServer: Error in health:', err);
                next(err);
            }
        });
    }

    private canUserJoinNewLobby(userId: string) {
        const previousLobbyForUser = this.userLobbyMap.get(userId)?.lobbyId;
        if (previousLobbyForUser) {
            const previousRole = this.userLobbyMap.get(userId)?.role;
            const previousLobby = this.lobbies.get(previousLobbyForUser);
            if (previousLobby) {
                const userLastActivity = previousLobby.getLastActivityForUser(userId);

                if (userLastActivity == null) {
                    return true;
                }

                const elapsedSeconds = Math.floor((Date.now() - userLastActivity.getTime()) / 1000);

                if (elapsedSeconds < 60 && previousRole === UserRole.Player) {
                    return false;
                }

                this.removeUserMaybeCleanupLobby(previousLobby, userId);
            }
        }

        return true;
    }

    public getUserLobbyId(userId: string): string | undefined {
        return this.userLobbyMap.get(userId).lobbyId;
    }

    // method for validating the deck via API
    private async processDeckValidation(
        deck: ISwuDbDecklist,
        format: SwuGameFormat,
        res: express.Response,
        onValid: () => Promise<void> | void
    ): Promise<void> {
        const validationResults = this.deckValidator.validateSwuDbDeck(deck, format);
        if (Object.keys(validationResults).length > 0) {
            res.status(400).json({
                success: false,
                errors: validationResults,
            });
            return;
        }
        await onValid();
    }

    private getOngoingGamesData() {
        const ongoingGames = [];

        // Loop through all lobbies and check if they have an ongoing game
        for (const lobby of this.lobbies.values()) {
            if (lobby.hasOngoingGame()) {
                const gameState = lobby.getGamePreview();
                if (gameState) {
                    ongoingGames.push(gameState);
                }
            }
        }

        return {
            numberOfOngoingGames: ongoingGames.length,
            ongoingGames
        };
    }

    private lobbiesWithOpenSeat() {
        return new Map(
            Array.from(this.lobbies.entries()).filter(([, lobby]) =>
                !lobby.isFilled() &&
                !lobby.isPrivate &&
                lobby.gameType !== MatchType.Quick &&
                !lobby.hasOngoingGame() &&
                lobby.hasConnectedPlayer()
            )
        );
    }

    /**
     * Creates a new lobby for the given user. If no user is provided and
     * the lobby is private, a default user is created.
     *
     * @param {User | string} user - The user creating the lobby. If string(id) is passed in for a private lobby, a default user is created with that id.
     * @param {Deck} deck - The deck used by this user.
     * @param {boolean} isPrivate - Whether or not this lobby is private.
     * @returns {string} The ID of the user who owns and created the newly created lobby.
     */
    private createLobby(lobbyName: string, user: User | string, deck: Deck, format: SwuGameFormat, isPrivate: boolean) {
        if (!user) {
            throw new Error('User must be provided to create a lobby');
        }
        if (!isPrivate && typeof user === 'string') {
            throw new Error('User must be provided for public lobbies');
        }

        // set default user if anonymous user is supplied for private lobbies
        if (typeof user === 'string') {
            user = { id: user, username: 'Player1' };
        }


        const lobby = new Lobby(
            lobbyName,
            isPrivate ? MatchType.Private : MatchType.Custom,
            format,
            this.cardDataGetter,
            this.deckValidator,
            this,
            this.testGameBuilder
        );
        this.lobbies.set(lobby.id, lobby);

        lobby.createLobbyUser(user, deck);
        lobby.setLobbyOwner(user.id);
        this.userLobbyMap.set(user.id, { lobbyId: lobby.id, role: UserRole.Player });
    }

    private async startTestGame(filename: string) {
        const lobby = new Lobby(
            'Test Game',
            MatchType.Custom,
            SwuGameFormat.Open,
            this.cardDataGetter,
            this.deckValidator,
            this,
            this.testGameBuilder
        );
        this.lobbies.set(lobby.id, lobby);
        const order66 = { id: 'exe66', username: 'Order66' };
        const theWay = { id: 'th3w4y', username: 'ThisIsTheWay' };
        lobby.createLobbyUser(order66);
        lobby.createLobbyUser(theWay);
        this.userLobbyMap.set(order66.id, { lobbyId: lobby.id, role: UserRole.Player });
        this.userLobbyMap.set(theWay.id, { lobbyId: lobby.id, role: UserRole.Player });
        await lobby.startTestGameAsync(filename);
    }

    private getTestSetupGames() {
        const testGamesDirPath = path.resolve(__dirname, '../../../test/gameSetups');
        if (!fs.existsSync(testGamesDirPath)) {
            return [];
        }

        return fs.readdirSync(testGamesDirPath).filter((file) => {
            const filePath = path.join(testGamesDirPath, file);
            return fs.lstatSync(filePath).isFile();
        });
    }

    // handshake(socket: socketio.Socket, next: () => void) {
    //     // if (socket.handshake.query.token && socket.handshake.query.token !== 'undefined') {
    //     //     jwt.verify(socket.handshake.query.token, env.secret, function (err, user) {
    //     //         if (err) {
    //     //             logger.info(err);
    //     //             return;
    //     //         }

    //     //         socket.request.user = user;
    //     //     });
    //     // }
    //     next();
    // }

    public async onConnection(ioSocket) {
        const user = JSON.parse(ioSocket.handshake.query.user);
        const requestedLobby = JSON.parse(ioSocket.handshake.query.lobby);
        const isSpectator = ioSocket.handshake.query.spectator === 'true';

        if (user) {
            ioSocket.data.user = user;
        }

        if (!ioSocket.data.user) {
            logger.info('GameServer: socket connected with no user, disconnecting');
            ioSocket.disconnect();
            return;
        }

        const lobbyUserEntry = this.userLobbyMap.get(user.id);
        // 0. If user is spectator
        if (isSpectator) {
            // Check if user is registered as a spectator
            if (!lobbyUserEntry || lobbyUserEntry.role !== UserRole.Spectator) {
                logger.info(`GameServer: User ${user.id} attempted to connect as spectator but is not registered`);
                ioSocket.disconnect();
                return;
            }
            const lobbyId = this.userLobbyMap.get(user.id).lobbyId;
            const lobby = this.lobbies.get(lobbyId);

            if (!lobby || !lobby.hasOngoingGame()) {
                logger.info(`GameServer: No lobby or ongoing game for spectator ${user.username}, disconnecting`);
                this.userLobbyMap.delete(user.id);
                ioSocket.disconnect();
                return;
            }
            const socket = new Socket(ioSocket);
            socket.registerEvent('disconnect', () => {
                this.onSocketDisconnected(ioSocket, user.id);
            });
            lobby.addSpectator(user, socket);
            return;
        }

        // 1. If user is already in a lobby
        if (lobbyUserEntry) {
            // we check the role if it is correct
            if (lobbyUserEntry.role !== UserRole.Player) {
                logger.info('GameServer: User ', user, 'tried  to join lobby with '
                    , lobbyUserEntry.role, 'instead of ', UserRole.Player);
                ioSocket.disconnect();
                return;
            }
            const lobbyId = lobbyUserEntry.lobbyId;
            const lobby = this.lobbies.get(lobbyId);

            if (!lobby) {
                this.userLobbyMap.delete(user.id);
                logger.info('GameServer: No lobby for', ioSocket.data.user.username, 'disconnecting');
                ioSocket.emit('connection_error', 'Lobby does not exist');
                ioSocket.disconnect();
                return;
            }

            // there can be a race condition where two users hit `join-lobby` at the same time, so we need to check if the lobby is filled already
            if (lobby.isFilled() && !lobby.hasPlayer(user.id)) {
                logger.info('GameServer: Lobby is full for user', user.username, 'disconnecting');
                ioSocket.emit('connection_error', 'Lobby is full');
                this.userLobbyMap.delete(user.id);
                return;
            }

            // we get the user from the lobby since this way we can be sure it's the correct one.
            const socket = new Socket(ioSocket);

            try {
                lobby.addLobbyUser(user, socket);
            } catch (err) {
                this.userLobbyMap.delete(user.id);
                ioSocket.emit('connection_error', 'Error connecting to lobby');
                ioSocket.disconnect();
                throw err;
            }

            socket.send('connectedUser', user.id);

            // If a user refreshes while they are matched with another player in the queue they lose the requeue listener
            // this is why we reinitialize the requeue listener
            if (lobby.gameType === MatchType.Quick) {
                if (!socket.eventContainsListener('requeue')) {
                    const lobbyUser = lobby.users.find((u) => u.id === user.id);
                    socket.registerEvent('requeue', () => this.requeueUser(socket, lobby.format, user, lobbyUser.deck.getDecklist()));
                }
            }
            socket.registerEvent('disconnect', () => this.onSocketDisconnected(ioSocket, user.id));
            return;
        }

        // 2. If user connected to the lobby via a link.
        if (requestedLobby.lobbyId) {
            const lobby = this.lobbies.get(requestedLobby.lobbyId);
            if (!lobby) {
                logger.info('GameServer: No lobby with this link for', ioSocket.data.user.username, 'disconnecting');
                ioSocket.disconnect();
                return;
            }

            // check if the lobby is full
            if (lobby.isFilled() || lobby.hasOngoingGame()) {
                logger.info('GameServer: Requested lobby', requestedLobby.lobbyId, 'is full or already in game, disconnecting');
                ioSocket.disconnect();
                return;
            }

            const socket = new Socket(ioSocket);

            // check if user is already in a lobby
            if (!this.canUserJoinNewLobby(user.id)) {
                logger.info('GameServer: User ', user, 'is already in a different lobby, disconnecting');
                ioSocket.disconnect();
                return;
            }
            // anonymous user joining existing game
            if (!user.username) {
                const newUser = { username: 'Player2', id: user.id };
                lobby.addLobbyUser(newUser, socket);
                this.userLobbyMap.set(newUser.id, { lobbyId: lobby.id, role: UserRole.Player });
                socket.registerEvent('disconnect', () => this.onSocketDisconnected(ioSocket, user.id));
                return;
            }

            lobby.addLobbyUser(user, socket);
            this.userLobbyMap.set(user.id, { lobbyId: lobby.id, role: UserRole.Player });
            socket.registerEvent('disconnect', () => this.onSocketDisconnected(ioSocket, user.id));
            return;
        }

        // 3. if they are not in the lobby they could be in a queue
        const queuedPlayer = this.queue.findPlayerInQueue(user.id);
        if (queuedPlayer) {
            queuedPlayer.socket = new Socket(ioSocket);

            // we check here if user is already in a lobby just in case
            if (lobbyUserEntry) {
                logger.info('GameServer: Queued User ', queuedPlayer, 'is already in a different lobby, disconnecting');
                ioSocket.disconnect();
                return;
            }

            // handle queue-specific events and add lobby disconnect
            queuedPlayer.socket.registerEvent('disconnect', () => this.onSocketDisconnected(ioSocket, user.id));

            await this.matchmakeAllQueues();
            return;
        }

        // A user should not get here
        ioSocket.emit('connection_error', 'Error connecting to lobby/game');
        ioSocket.disconnect();
        // this can happen when someone tries to reconnect to the game but are out of the mapping TODO make a notification for the player
        logger.info(`GameServer: Error state when connecting to lobby/game ${user.id} disconnecting`);
    }

    /**
     * Put a user into the queue array. They always start with a null socket.
     */
    private enterQueue(format: SwuGameFormat, user: any, deck: any): boolean {
        // Quick check: if they're already in a lobby, no queue
        if (this.userLobbyMap.has(user.id)) {
            logger.info(`GameServer: User ${user.id} already in a lobby, ignoring queue request.`);
            return false;
        }

        this.queue.addPlayer(
            format,
            {
                user,
                deck,
                socket: null
            }
        );
        return true;
    }

    private matchmakeAllQueues() {
        const formatsWithMatches = this.queue.findReadyFormats();

        for (const format of formatsWithMatches) {
            while (true) {
                const matchedPlayers = this.queue.getNextMatchPair(format);
                if (!matchedPlayers) {
                    break;
                }

                this.matchmakeQueuePlayers(format, matchedPlayers);
            }
        }
    }

    /**
     * Matchmake two users in a queue
     */
    private matchmakeQueuePlayers(format: SwuGameFormat, [p1, p2]: [IQueuedPlayer, IQueuedPlayer]): void {
        Contract.assertFalse(p1.user.id === p2.user.id, 'Cannot matchmake the same user');
        // Create a new Lobby
        const lobby = new Lobby(
            'Quick Game',
            MatchType.Quick,
            format,
            this.cardDataGetter,
            this.deckValidator,
            this,
            this.testGameBuilder
        );
        this.lobbies.set(lobby.id, lobby);

        // Create the 2 lobby users
        lobby.createLobbyUser(p1.user, p1.deck);
        lobby.createLobbyUser(p2.user, p2.deck);

        // Attach their sockets to the lobby (if they exist)
        const socket1 = p1.socket ? p1.socket : null;
        const socket2 = p2.socket ? p2.socket : null;
        if (socket1) {
            lobby.addLobbyUser(p1.user, socket1);
            socket1.registerEvent('disconnect', () => this.onSocketDisconnected(socket1.socket, p1.user.id));
            if (!socket1.eventContainsListener('requeue')) {
                socket1.registerEvent('requeue', () => this.requeueUser(socket1, format, p1.user, p1.deck));
            }
        }
        if (socket2) {
            lobby.addLobbyUser(p2.user, socket2);
            socket2.registerEvent('disconnect', () => this.onSocketDisconnected(socket2.socket, p2.user.id));
            if (!socket2.eventContainsListener('requeue')) {
                socket2.registerEvent('requeue', () => this.requeueUser(socket2, format, p2.user, p2.deck));
            }
        }

        // Save user => lobby mapping
        this.userLobbyMap.set(p1.user.id, { lobbyId: lobby.id, role: UserRole.Player });
        this.userLobbyMap.set(p2.user.id, { lobbyId: lobby.id, role: UserRole.Player });

        // If needed, set tokens async
        lobby.setLobbyOwner(p1.user.id);
        // this needs to be here since we only send start game via the LobbyOwner.
        lobby.sendLobbyState();
        logger.info(`GameServer: Matched players ${p1.user.username} and ${p2.user.username} in lobby ${lobby.id}.`);
    }

    /**
     * requeues the user and removes him from the previous lobby. If the lobby is empty, it cleans it up.
     */
    private async requeueUser(socket: Socket, format: SwuGameFormat, user: User, deck: any) {
        if (this.userLobbyMap.has(user.id)) {
            const lobbyId = this.userLobbyMap.get(user.id).lobbyId;
            const lobby = this.lobbies.get(lobbyId);
            this.userLobbyMap.delete(user.id);
            lobby.removeUser(user.id);
            // check if lobby is empty
            if (lobby.isEmpty()) {
                // cleanup process
                lobby.cleanLobby();
                this.lobbies.delete(lobbyId);
            }
        }
        // add user to queue
        this.queue.addPlayer(
            format,
            {
                user,
                deck,
                socket: socket
            }
        );

        // perform matchmaking
        await this.matchmakeAllQueues();
    }

    private removeUserMaybeCleanupLobby(lobby: Lobby | null, userId: string) {
        lobby?.removeUser(userId);
        lobby?.removeSpectator(userId);
        // Check if lobby is empty
        if (lobby?.isEmpty()) {
            // Start the cleanup process
            lobby?.cleanLobby();
            this.lobbies.delete(lobby?.id);
        }
    }

    public removeLobby(lobby: Lobby, errorMessage: string) {
        this.lobbies.delete(lobby.id);

        for (const user of lobby.users) {
            this.userLobbyMap.delete(user.id);
            user.socket?.send('connection_error', errorMessage);
        }

        lobby.cleanLobby();
    }

    public onSocketDisconnected(socket: IOSocket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>, id: string) {
        try {
            const lobbyEntry = this.userLobbyMap.get(id);
            if (!lobbyEntry) {
                this.queue.removePlayer(id);
                return;
            }
            const lobbyId = lobbyEntry.lobbyId;
            const lobby = this.lobbies.get(lobbyId);

            const wasManualDisconnect = !!socket?.data?.manualDisconnect;
            if (wasManualDisconnect) {
                this.userLobbyMap.delete(id);
                this.removeUserMaybeCleanupLobby(lobby, id);
                return;
            }
            // TODO perhaps add a timeout for lobbies so they clean themselves up if somehow they become empty
            //  without triggering onSocketDisconnect
            lobby?.setUserDisconnected(id);
            setTimeout(() => {
                try {
                    // Check if the user is still disconnected after the timer
                    if (lobby?.getUserState(id) === 'disconnected') {
                        this.userLobbyMap.delete(id);
                        this.removeUserMaybeCleanupLobby(lobby, id);
                    }
                } catch (err) {
                    logger.error('Error in setTimeout for onSocketDisconnected:', err);
                }
            }, 20000);
        } catch (err) {
            logger.error('Error in onSocketDisconnected:', err);
        }
    }
}
