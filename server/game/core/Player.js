const { GameObject } = require('./GameObject');
const { Deck } = require('../../utils/deck/Deck.js');
const UpgradePrompt = require('./gameSteps/prompts/UpgradePrompt.js');
const { clockFor } = require('./clocks/ClockSelector.js');
const { CostAdjuster, CostAdjustType } = require('./cost/CostAdjuster');
const { PlayableZone } = require('./PlayableZone');
const { PlayerPromptState } = require('./PlayerPromptState.js');
const Contract = require('./utils/Contract');
const {
    CardType,
    EffectName,
    ZoneName,
    RelativePlayer,
    Aspect,
    WildcardZoneName,
    PlayType,
    KeywordName,
    WildcardCardType,
    Trait,
    WildcardRelativePlayer,
    Stage
} = require('./Constants');

const EnumHelpers = require('./utils/EnumHelpers');
const Helpers = require('./utils/Helpers');
const { AbilityContext } = require('./ability/AbilityContext');
const { HandZone } = require('./zone/HandZone');
const { DeckZone } = require('./zone/DeckZone');
const { ResourceZone } = require('./zone/ResourceZone');
const { DiscardZone } = require('./zone/DiscardZone');
const { OutsideTheGameZone } = require('./zone/OutsideTheGameZone');
const { BaseZone } = require('./zone/BaseZone');
const Game = require('./Game');
const { ZoneAbstract } = require('./zone/ZoneAbstract');
const { Card } = require('./card/Card');
const { ExploitCostAdjuster } = require('../abilities/keyword/exploit/ExploitCostAdjuster');
const { MergedExploitCostAdjuster } = require('../abilities/keyword/exploit/MergedExploitCostAdjuster');

class Player extends GameObject {
    /**
     * @param {string} id
     * @param {import('../../Settings').User} user
     * @param {Game} game
     * @param {import('./clocks/ClockSelector.js').ClockConfig} [clockDetails]
     */
    constructor(id, user, game, clockDetails) {
        super(game, user.username);

        Contract.assertNotNullLike(id);
        Contract.assertNotNullLike(user);
        Contract.assertNotNullLike(game);
        // clockDetails is optional

        this.user = user;
        this.id = id;
        this.printedType = 'player';
        this.socket = null;
        this.disconnected = false;
        this.left = false;

        this.handZone = new HandZone(this);
        this.resourceZone = new ResourceZone(this);
        this.discardZone = new DiscardZone(this);
        this.canTakeActionsThisPhase = null;

        // mainly used for staging tokens when they are created / removed
        this.outsideTheGameZone = new OutsideTheGameZone(this);

        /** @type {BaseZone} */
        this.baseZone = null;

        /** @type {DeckZone} */
        this.deckZone = new DeckZone(this);

        this.damageToBase = null;

        this.clock = clockFor(this, clockDetails);

        this.limitedPlayed = 0;
        this.decklist = {};

        /** @type {Deck} */
        this.decklistNames = null;

        /** @type {CostAdjuster[]} */
        this.costAdjusters = [];
        this.abilityMaxByIdentifier = {}; // This records max limits for abilities
        this.promptedActionWindows = user.promptedActionWindows || {
            // these flags represent phase settings
            action: true,
            regroup: true
        };
        this.optionSettings = user.settings.optionSettings;
        this.resetTimerAtEndOfRound = false;

        this.promptState = new PlayerPromptState(this);
    }

    /**
     * @override
     * @returns {this is Player}
     */
    isPlayer() {
        return true;
    }

    get autoSingleTarget() {
        return this.optionSettings.autoSingleTarget;
    }

    startClock() {
        this.clock.start();
        if (this.opponent) {
            this.opponent.clock.opponentStart();
        }
    }

    stopNonChessClocks() {
        if (this.clock.name !== 'Chess Clock') {
            this.stopClock();
        }
    }

    stopClock() {
        this.clock.stop();
    }

    resetClock() {
        this.clock.reset();
    }

    /**
     * @param {import('./zone/AllArenasZone').IAllArenasForPlayerCardFilterProperties} filter
     */
    getArenaCards(filter = {}) {
        return this.game.allArenas.getCards({ ...filter, controller: this });
    }

    /**
     * @param {import('./zone/AllArenasZone').IAllArenasForPlayerSpecificTypeCardFilterProperties} filter
     */
    getArenaUnits(filter = {}) {
        return this.game.allArenas.getUnitCards({ ...filter, controller: this });
    }

    // TODO: this will be refactored to merge with getArenaUnits
    /**
     * Get all units in designated play arena(s) controlled by this player
     * @param { WildcardZoneName.AnyArena | ZoneName.GroundArena | ZoneName.SpaceArena } arena Arena to select units from
     * @param {(card: import('./card/propertyMixins/UnitProperties').IUnitCard) => boolean} cardCondition Condition to filter cards
     */
    getUnitsInPlay(arena = WildcardZoneName.AnyArena, cardCondition = () => true) {
        return this.getArenaUnits({ arena, condition: cardCondition });
    }

    /**
     * @param {import('./zone/AllArenasZone').IAllArenasForPlayerSpecificTypeCardFilterProperties} filter
     */
    getArenaUpgrades(filter = {}) {
        return this.game.allArenas.getUpgradeCards({ ...filter, controller: this });
    }

    /**
     * @param {import('./zone/AllArenasZone').IAllArenasForPlayerCardFilterProperties} filter
     */
    hasSomeArenaCard(filter) {
        return this.game.allArenas.hasSomeCard({ ...filter, controller: this });
    }

    /**
     * @param {import('./zone/AllArenasZone').IAllArenasForPlayerSpecificTypeCardFilterProperties} filter
     */
    hasSomeArenaUnit(filter) {
        return this.game.allArenas.hasSomeCard({ ...filter, type: WildcardCardType.Unit, controller: this });
    }

    /**
     * @param {import('./zone/AllArenasZone').IAllArenasForPlayerSpecificTypeCardFilterProperties} filter
     */
    hasSomeArenaUpgrade(filter) {
        return this.game.allArenas.hasSomeCard({ ...filter, type: WildcardCardType.Upgrade, controller: this });
    }

    /**
     * Get all units in designated play arena(s) controlled by this player
     * @param { Trait } trait Get units with this trait
     */
    getUnitsInPlayWithTrait(trait) {
        return this.getArenaUnits({ trait });
    }

    /**
     * Get all cards in designated play arena(s) other than the passed card controlled by this player.
     * @param { any } ignoreUnit Unit to filter from the returned results
     * @param { Trait } trait The Trait to check for
     * @param { WildcardZoneName.AnyArena | ZoneName.GroundArena | ZoneName.SpaceArena } arena Arena to select units from
     */
    getOtherUnitsInPlayWithTrait(ignoreUnit, trait, arena = WildcardZoneName.AnyArena) {
        return this.getArenaCards({ otherThan: ignoreUnit, trait, arena }).filter((card) => card.isUnit() && card !== ignoreUnit && card.hasSomeTrait(trait));
    }


    /**
     * Get all units in designated play arena(s) controlled by this player
     * @param { Aspect } aspect Aspect needed for units
     * @param { WildcardZoneName.AnyArena | ZoneName.GroundArena | ZoneName.SpaceArena } arena Arena to select units from
     * @param {(card: Card) => boolean} [cardCondition=(card) => true]
     */
    getUnitsInPlayWithAspect(aspect, arena = WildcardZoneName.AnyArena, cardCondition = () => true) {
        return this.getArenaUnits({ aspect, arena, condition: cardCondition });
    }

    /**
     * Get all cards in designated play arena(s) other than the passed card controlled by this player.
     * @param { any } ignoreUnit Unit to filter from the returned results
     * @param { WildcardZoneName.AnyArena | ZoneName.GroundArena | ZoneName.SpaceArena } arena Arena to select units from
     * @param {(card: Card) => boolean} [cardCondition=(card) => true]
     */
    getOtherUnitsInPlay(ignoreUnit, arena = WildcardZoneName.AnyArena, cardCondition = () => true) {
        return this.getArenaUnits({ otherThan: ignoreUnit, arena, condition: cardCondition });
    }

    /**
     * Get all cards in designated play arena(s) other than the passed card controlled by this player.
     * @param { any } ignoreUnit Unit to filter from the returned results
     * @param { Aspect } aspect Aspect needed for units
     * @param { WildcardZoneName.AnyArena | ZoneName.GroundArena | ZoneName.SpaceArena } arena Arena to select units from
     * @param {(card: Card) => boolean} [cardCondition=(card) => true]
     */
    getOtherUnitsInPlayWithAspect(ignoreUnit, aspect, arena = WildcardZoneName.AnyArena, cardCondition = () => true) {
        return this.getArenaUnits({ otherThan: ignoreUnit, aspect, arena, condition: cardCondition });
    }

    /**
     * @param { String } title the title of the unit or leader to check for control of
     * @returns { boolean } true if this player controls a unit or leader with the given title
     */
    controlsLeaderUnitOrUpgradeWithTitle(title) {
        return this.leader.title === title ||
          this.hasSomeArenaUnit({ condition: (card) => card.title === title }) ||
          this.hasSomeArenaUpgrade({ condition: (card) => card.title === title });
    }

    /**
     * @param { Trait } trait the trait to look for
     * @returns { boolean } true if this player controls a card with the trait
     */
    controlsCardWithTrait(trait, onlyUnique = false) {
        return this.leader.hasSomeTrait(trait) || this.hasSomeArenaCard({ condition: (card) => (card.hasSomeTrait(trait) && (onlyUnique ? card.unique : true)) });
    }

    /**
     * @param {ZoneName} zoneName
     * @returns {ZoneAbstract}
     */
    getZone(zoneName) {
        switch (zoneName) {
            case ZoneName.Hand:
                return this.handZone;
            case ZoneName.Deck:
                return this.deckZone;
            case ZoneName.Discard:
                return this.discardZone;
            case ZoneName.Resource:
                return this.resourceZone;
            case ZoneName.Base:
                return this.baseZone;
            case ZoneName.OutsideTheGame:
                return this.outsideTheGameZone;
            case ZoneName.SpaceArena:
                return this.game.spaceArena;
            case ZoneName.GroundArena:
                return this.game.groundArena;
            default:
                Contract.fail(`Unknown zone: ${zoneName}`);
        }
    }

    /**
     * @param {ZoneName} zoneName
     * @returns {Card[]}
     */
    getCardsInZone(zoneName) {
        switch (zoneName) {
            case ZoneName.Hand:
                return this.handZone.cards;
            case ZoneName.Deck:
                Contract.assertNotNullLike(this.deckZone);
                return this.deckZone.cards;
            case ZoneName.Discard:
                return this.discardZone.cards;
            case ZoneName.Resource:
                return this.resourceZone.cards;
            case ZoneName.Base:
                return this.baseZone.cards;
            case ZoneName.OutsideTheGame:
                return this.outsideTheGameZone.cards;
            case ZoneName.SpaceArena:
                return this.game.spaceArena.getCards({ controller: this });
            case ZoneName.GroundArena:
                return this.game.groundArena.getCards({ controller: this });
            case ZoneName.Capture:
                return this.game.getAllCapturedCards(this);
            default:
                Contract.fail(`Unknown zone: ${zoneName}`);
        }
    }

    /**
     * Checks whether a card with a uuid matching the passed card is in the passed _(Array)
     * @template {Card} T
     * @param {T[]} list
     * @param {T} card
     */
    isCardUuidInList(list, card) {
        return list.some((c) => {
            return c.uuid === card.uuid;
        });
    }

    /**
     * Checks whether a card with a name matching the passed card is in the passed list
     * @template {Card} T
     * @param {T[]} list
     * @param {T} card
     */
    isCardNameInList(list, card) {
        return list.some((c) => {
            return c.title === card.title;
        });
    }

    /**
     * Removes a card with the passed uuid from a list. Returns an _(Array)
     * @template {Card} T
     * @param {T[]} list
     * @param {String} uuid
     */
    removeCardByUuid(list, uuid) {
        return list.filter((card) => card.uuid !== uuid);
    }

    /**
     * Returns a card with the passed name in the passed list
     * @template {Card} T
     * @param {T[]} list
     * @param {String} name
     */
    findCardByName(list, name) {
        return this.findCard(list, (card) => card.title === name);
    }

    /**
     * Returns a list of cards matching passed name
     * @template {Card} T
     * @param {T[]} list
     * @param {String} name
     */
    findCardsByName(list, name) {
        return this.findCards(list, (card) => card.title === name);
    }

    /**
     * Returns a card with the passed uuid in the passed list
     * @template {Card} T
     * @param {T[]} list
     * @param {String} uuid
     */
    findCardByUuid(list, uuid) {
        return this.findCard(list, (card) => card.uuid === uuid);
    }

    /**
     * Returns a card with the passed uuid from cardsInPlay
     * @param {String} uuid
     */
    findCardInPlayByUuid(uuid) {
        return this.findCard(this.getArenaCards(), (card) => card.uuid === uuid);
    }

    /**
     * Returns a card which matches passed predicate in the passed list
     * @template {Card} T
     * @param {T[]} cardList
     * @param {(card: T) => Boolean} predicate
     * @returns {T=}
     */
    findCard(cardList, predicate) {
        var cards = this.findCards(cardList, predicate);
        if (!cards || cards.length === 0) {
            return undefined;
        }

        return cards[0];
    }

    /**
     * Returns an Array of BaseCard which match passed predicate in the passed list
     * @template {Card} T
     * @param {T[]} cardList
     * @param {(card: T) => Boolean} predicate
     * @returns {T[]}
     */
    findCards(cardList, predicate) {
        Contract.assertNotNullLike(cardList);

        var cardsToReturn = [];

        cardList.forEach((card) => {
            if (predicate(card)) {
                cardsToReturn.push(card);
            }

            return cardsToReturn;
        });

        return cardsToReturn;
    }

    // TODO: add support for checking upgrades
    /**
     * Returns if a unit is in play that has the passed trait
     * @param {Trait} trait
     * @param {any} ignoreUnit
     * @returns {boolean} true/false if the trait is in play
     */
    isTraitInPlay(trait, ignoreUnit = null) {
        return this.hasSomeArenaUnit({ trait, otherThan: ignoreUnit });
    }

    /**
     * Returns if a unit is in play that has the passed aspect
     * @param {Aspect} aspect
     * @param {any} ignoreUnit
     * @returns {boolean} true/false if the trait is in play
     */
    isAspectInPlay(aspect, ignoreUnit = null) {
        return this.hasSomeArenaUnit({ aspect, otherThan: ignoreUnit });
    }

    /**
     * Returns if a unit is in play that has the passed keyword
     * @param {KeywordName} keyword
     * @param {any} ignoreUnit
     * @returns {boolean} true/false if the trait is in play
     */
    isKeywordInPlay(keyword, ignoreUnit = null) {
        return this.hasSomeArenaUnit({ keyword, otherThan: ignoreUnit });
    }

    /**
     * Returns true if any units or upgrades controlled by this player match the passed predicate
     * @param {Function} predicate - DrawCard => Boolean
     */
    anyCardsInPlay(predicate) {
        return this.game.allCards.some(
            (card) => card.controller === this && EnumHelpers.isArena(card.zoneName) && predicate(card)
        );
    }

    /**
     * Returns an Array of all unots and upgrades matching the predicate controlled by this player
     * @param {Function} predicate  - DrawCard => Boolean
     */
    filterCardsInPlay(predicate) {
        return this.game.allCards.filter(
            (card) => card.controller === this && EnumHelpers.isArena(card.zoneName) && predicate(card)
        );
    }

    isActivePlayer() {
        return this.game.getActivePlayer() === this;
    }

    hasInitiative() {
        return this.game.initiativePlayer === this;
    }

    assignIndirectDamageDealtToOpponents() {
        return this.hasOngoingEffect(EffectName.AssignIndirectDamageDealtToOpponents);
    }

    /**
     * Returns the total number of units and upgrades controlled by this player which match the passed predicate
     * @param {Function} predicate - DrawCard => Int
     */
    getNumberOfCardsInPlay(predicate) {
        return this.game.allCards.reduce((num, card) => {
            if (card.controller === this && EnumHelpers.isArena(card.zoneName) && predicate(card)) {
                return num + 1;
            }

            return num;
        }, 0);
    }

    /**
     * Checks whether the passed card is in a legal zone for the passed type of play
     * @param {Card} card
     * @param {PlayType} [playingType]
     */
    isCardInPlayableZone(card, playingType = null) {
        // Check if card can be legally played by this player out of discard from an ongoing effect
        if (
            playingType === PlayType.PlayFromOutOfPlay &&
            card.zoneName === ZoneName.Discard &&
            card.hasOngoingEffect(EffectName.CanPlayFromDiscard)
        ) {
            return card
                .getOngoingEffectValues(EffectName.CanPlayFromDiscard)
                .map((value) => value.player ?? card.owner)
                .includes(this);
        }

        // Default to checking if there is a zone that matches play type and includes the card
        return this.playableZones.some(
            (zone) => (!playingType || zone.playingType === playingType) && zone.includes(card)
        );
    }

    /**
     * @param {Card} card
     * @returns {PlayType=}
     */
    findPlayType(card) {
        let zone = this.playableZones.find((zone) => zone.includes(card));
        if (zone) {
            return zone.playingType;
        }

        return undefined;
    }

    /**
     * Returns a card in play under this player's control which matches (for uniqueness) the passed card
     * @param {import('./card/baseClasses/InPlayCard').IInPlayCard} card
     * @returns {import('./card/baseClasses/InPlayCard').IInPlayCard[]} Duplicates of passed card (does not check unique status)
     */
    getDuplicatesInPlay(card) {
        return this.getArenaCards().filter((otherCard) =>
            otherCard.title === card.title &&
            otherCard.subtitle === card.subtitle &&
            otherCard !== card
        );
    }

    /**
     * Returns ths top card of the player's deck
     * @returns {import('./card/baseClasses/PlayableOrDeployableCard').IPlayableCard | null} the Card,© or null if the deck is empty
     */
    getTopCardOfDeck() {
        if (this.drawDeck.length > 0) {
            return this.drawDeck[0];
        }
        return null;
    }


    /**
     * Returns ths top cards of the player's deck
     * @param {number} numCard
     * @returns {import('./card/baseClasses/PlayableOrDeployableCard').IPlayableCard[]} the Card,© or null if the deck is empty
     */
    getTopCardsOfDeck(numCard) {
        Contract.assertPositiveNonZero(numCard);
        const deckLength = this.drawDeck.length;
        const cardsToGet = Math.min(numCard, deckLength);

        if (this.drawDeck.length > 0) {
            return this.drawDeck.slice(0, cardsToGet);
        }
        return [];
    }

    /**
     * Draws the passed number of cards from the top of the deck into this players hand, shuffling if necessary
     * @param {number} numCards
     */
    drawCardsToHand(numCards) {
        if (numCards > this.drawDeck.length) {
            // TODO: move log message into the DrawSystem
            // Game log message about empty deck damage(the damage itself is handled in DrawSystem.updateEvent()).
            this.game.addMessage('{0} attempts to draw {1} cards from their empty deck and takes {2} damage instead ',
                this.name, numCards - this.drawDeck.length, 3 * (numCards - this.drawDeck.length)
            );
        }
        for (let card of this.drawDeck.slice(0, numCards)) {
            card.moveTo(ZoneName.Hand);
        }
    }

    getStartingHandSize() {
        let startingHandSize = 6;
        if (this.base.hasOngoingEffect(EffectName.ModifyStartingHandSize)) {
            this.base.getOngoingEffectValues(EffectName.ModifyStartingHandSize).forEach((value) => {
                startingHandSize += value.amount;
            });
        }
        return startingHandSize;
    }

    // /**
    //  * Called when one of the players decks runs out of cards, removing 5 honor and shuffling the discard pile back into the deck
    //  * @param {String} deck - one of 'conflict' or 'dynasty'
    //  */
    // deckRanOutOfCards(deck) {
    //     let discardPile = this.getCardPile(deck + ' discard pile');
    //     let action = GameSystems.loseHonor({ amount: this.game.gameMode === GameMode.Skirmish ? 3 : 5 });
    //     if (action.canAffect(this, this.game.getFrameworkContext())) {
    //         this.game.addMessage(
    //             '{0}'s {1} deck has run out of cards, so they lose {2} honor',
    //             this,
    //             deck,
    //             this.game.gameMode === GameMode.Skirmish ? 3 : 5
    //         );
    //     } else {
    //         this.game.addMessage('{0}'s {1} deck has run out of cards', this, deck);
    //     }
    //     action.resolve(this, this.game.getFrameworkContext());
    //     this.game.queueSimpleStep(() => {
    //         discardPile.each((card) => this.moveCard(card, deck + ' deck'));
    //         if (deck === 'dynasty') {
    //             this.shuffleDynastyDeck();
    //         } else {
    //             this.shuffleConflictDeck();
    //         }
    //     });
    // }

    // /**
    //  * Moves the top card of the dynasty deck to the passed province
    //  * @param {String} zone - one of 'province 1', 'province 2', 'province 3', 'province 4'
    //  */
    // replaceDynastyCard(zone) {
    //     let province = this.getProvinceCardInProvince(zone);

    //     if (!province || this.getCardPile(zone).size() > 1) {
    //         return false;
    //     }
    //     if (this.dynastyDeck.size() === 0) {
    //         this.deckRanOutOfCards('dynasty');
    //         this.game.queueSimpleStep(() => this.replaceDynastyCard(zone));
    //     } else {
    //         let refillAmount = 1;
    //         if (province) {
    //             let amount = province.mostRecentOngoingEffect(EffectName.RefillProvinceTo);
    //             if (amount) {
    //                 refillAmount = amount;
    //             }
    //         }

    //         this.refillProvince(zone, refillAmount);
    //     }
    //     return true;
    // }

    // putTopDynastyCardInProvince(zone, facedown = false) {
    //     if (this.dynastyDeck.size() === 0) {
    //         this.deckRanOutOfCards('dynasty');
    //         this.game.queueSimpleStep(() => this.putTopDynastyCardInProvince(zone, facedown));
    //     } else {
    //         let cardFromDeck = this.dynastyDeck.first();
    //         this.moveCard(cardFromDeck, zone);
    //         cardFromDeck.facedown = facedown;
    //         return true;
    //     }
    //     return true;
    // }

    /**
     * Shuffles the deck, displaying a message in chat
     * @param {AbilityContext} context
     */
    shuffleDeck(context = null) {
        this.game.addMessage('{0} is shuffling their deck', this);
        this.deckZone.shuffle(this.game.randomGenerator);
    }

    /**
     * Takes a decklist passed from the lobby, creates all the cards in it, and puts references to them in the relevant lists
     */
    async prepareDecksAsync() {
        var preparedDecklist = await this.decklistNames.buildCardsAsync(this, this.game.cardDataGetter);

        this.base = preparedDecklist.base;
        this.leader = preparedDecklist.leader;

        this.deckZone.initialize(preparedDecklist.deckCards);

        // set up playable zones now that all relevant zones are created
        /** @type {PlayableZone[]} */
        this.playableZones = [
            new PlayableZone(PlayType.PlayFromHand, this.handZone),
            new PlayableZone(PlayType.Piloting, this.handZone),
            new PlayableZone(PlayType.Smuggle, this.resourceZone),
            new PlayableZone(PlayType.Piloting, this.deckZone), // TODO: interaction with Ezra
            new PlayableZone(PlayType.PlayFromOutOfPlay, this.deckZone),
            new PlayableZone(PlayType.Piloting, this.discardZone), // TODO: interactions with Fine Addition
            new PlayableZone(PlayType.PlayFromOutOfPlay, this.discardZone),
        ];

        this.baseZone = new BaseZone(this, this.base, this.leader);

        this.decklist = preparedDecklist;
    }

    /**
     * Called when the Game object starts the game. Creates all cards on this players decklist, shuffles the decks and initialises player parameters for the start of the game
     */
    initialiseAsync() {
        this.opponent = this.game.getOtherPlayer(this);
        return this.prepareDecksAsync();
    }

    /**
     * Adds the passed Cost Adjuster to this Player
     * @param source = OngoingEffectSource source of the adjuster
     * @param {CostAdjuster} costAdjuster
     */
    addCostAdjuster(costAdjuster) {
        this.costAdjusters.push(costAdjuster);
    }

    /**
     * Unregisters and removes the passed Cost Adjusters from this Player
     * @param {CostAdjuster} adjuster
     */
    removeCostAdjuster(adjuster) {
        if (this.costAdjusters.includes(adjuster)) {
            adjuster.unregisterEvents();
            this.costAdjusters = this.costAdjusters.filter((r) => r !== adjuster);
        }
    }

    /**
     * @param {PlayType} type
     * @param {import('../Interfaces').Zone} zone
     * @returns
     */
    addPlayableZone(type, zone) {
        let playableZone = new PlayableZone(type, zone);
        this.playableZones.push(playableZone);
        return playableZone;
    }

    /**
     * @param {PlayableZone} zone
     */
    removePlayableZone(zone) {
        this.playableZones = this.playableZones.filter((l) => l !== zone);
    }

    /**
     * Returns the aspects for this player (derived from base and leader)
     */
    getAspects() {
        return this.leader.aspects.concat(this.base.aspects);
    }

    /**
     * @param {Aspect[]} costAspects
     * @returns {Aspect[]}
     */
    getPenaltyAspects(costAspects) {
        if (!costAspects) {
            return [];
        }

        let playerAspects = this.getAspects();

        let penaltyAspects = [];
        for (const aspect of costAspects) {
            let matchedIndex = playerAspects.indexOf(aspect);
            if (matchedIndex === -1) {
                penaltyAspects.push(aspect);
            } else {
                playerAspects.splice(matchedIndex, 1);
            }
        }

        return penaltyAspects;
    }

    // UP NEXT: add support for "ignoreExploit" in here, and also figure out how to merge exploit adjusters for "PlayCardResourceCost.canPay"

    /**
     * Checks if any Cost Adjusters on this Player apply to the passed card/target, and returns the cost to play the cost if they are used.
     * Accounts for aspect penalties and any modifiers to those specifically
     * @param {number} cost
     * @param {Aspect[]} aspects
     * @param {AbilityContext} context
     * @param {CostAdjuster[]} additionalCostAdjusters Used by abilities to add their own specific cost adjuster if necessary
     */
    getAdjustedCost(cost, aspects, context, additionalCostAdjusters = null, ignoreExploit = false) {
        const card = context.source;

        // if any aspect penalties, check modifiers for them separately
        let aspectPenaltiesTotal = 0;

        let penaltyAspects = this.getPenaltyAspects(aspects);
        for (const aspect of penaltyAspects) {
            aspectPenaltiesTotal += this.runAdjustersForAspectPenalties(2, context, aspect, additionalCostAdjusters, ignoreExploit);
        }

        let penalizedCost = cost + aspectPenaltiesTotal;
        return this.runAdjustersForCostType(penalizedCost, card, context, additionalCostAdjusters, ignoreExploit);
    }

    /**
     * Runs the Adjusters for a specific cost type - either base cost or an aspect penalty - and returns the modified result
     * @param {number} baseCost
     * @param card
     * @param target
     * @param {CostAdjuster[]} additionalCostAdjusters Used by abilities to add their own specific cost adjuster if necessary
     */
    runAdjustersForCostType(baseCost, card, context, additionalCostAdjusters = null, ignoreExploit = false) {
        const matchingAdjusters = this.getMatchingCostAdjusters(context, null, additionalCostAdjusters, ignoreExploit);
        const costIncreases = matchingAdjusters
            .filter((adjuster) => adjuster.costAdjustType === CostAdjustType.Increase)
            .reduce((cost, adjuster) => cost + adjuster.getAmount(card, this, context), 0);
        const costDecreases = matchingAdjusters
            .filter((adjuster) => adjuster.costAdjustType === CostAdjustType.Decrease)
            .reduce((cost, adjuster) => cost + adjuster.getAmount(card, this, context), 0);

        baseCost += costIncreases;
        let reducedCost = baseCost - costDecreases;

        if (matchingAdjusters.some((adjuster) => adjuster.costAdjustType === CostAdjustType.Free)) {
            reducedCost = 0;
        }

        return Math.max(reducedCost, 0);
    }


    /**
     * Runs the Adjusters for a specific cost type - either base cost or an aspect penalty - and returns the modified result
     * @param {number} baseCost
     * @param card
     * @param target
     * @param penaltyAspect Aspect that is not present on the current base or leader
     * @param {CostAdjuster[]} additionalCostAdjusters Used by abilities to add their own specific cost adjuster if necessary
     */
    runAdjustersForAspectPenalties(baseCost, context, penaltyAspect, additionalCostAdjusters = null, ignoreExploit = false) {
        const matchingAdjusters = this.getMatchingCostAdjusters(context, penaltyAspect, additionalCostAdjusters, ignoreExploit);

        const ignoreAllAspectPenalties = matchingAdjusters
            .filter((adjuster) => adjuster.costAdjustType === CostAdjustType.IgnoreAllAspects).length > 0;

        const ignoreSpecificAspectPenalty = matchingAdjusters
            .filter((adjuster) => adjuster.costAdjustType === CostAdjustType.IgnoreSpecificAspects).length > 0;

        let cost = baseCost;
        if (ignoreAllAspectPenalties || ignoreSpecificAspectPenalty) {
            cost -= 2;
        }

        return Math.max(cost, 0);
    }

    /**
     * @param {AbilityContext} context
     * @param {Aspect=} penaltyAspect
     * @param {CostAdjuster[]=} additionalCostAdjusters
     * @param {boolean} ignoreExploit
     * @returns {CostAdjuster[]}
     */
    getMatchingCostAdjusters(context, penaltyAspect = null, additionalCostAdjusters = [], ignoreExploit = false) {
        const allMatchingAdjusters = this.costAdjusters.concat(additionalCostAdjusters)
            .filter((adjuster) => {
                // TODO: Make this work with Piloting
                if (context.stage === Stage.Cost && !context.target && context.source.isUpgrade()) {
                    const upgrade = context.source;
                    return context.game.getArenaUnits()
                        .filter((unit) => upgrade.canAttach(unit, context))
                        .some((unit) => adjuster.canAdjust(context.playType, upgrade, context, unit, penaltyAspect));
                }
                return adjuster.canAdjust(context.playType, context.source, context, context.target, penaltyAspect);
            });

        if (ignoreExploit) {
            return allMatchingAdjusters.filter((adjuster) => !adjuster.isExploit());
        }

        const { trueAra: exploitAdjusters, falseAra: nonExploitAdjusters } =
                    Helpers.splitArray(allMatchingAdjusters, (adjuster) => adjuster.isExploit());

        // if there are multiple Exploit adjusters, generate a single merged one to represent the total Exploit value
        const costAdjusters = nonExploitAdjusters;
        if (exploitAdjusters.length > 1) {
            Contract.assertTrue(exploitAdjusters.every((adjuster) => adjuster.isExploit()));
            Contract.assertTrue(context.source.hasCost());
            costAdjusters.unshift(new MergedExploitCostAdjuster(exploitAdjusters, context.source, context));
        } else {
            costAdjusters.unshift(...exploitAdjusters);
        }

        return costAdjusters;
    }

    /**
     * Mark all cost adjusters which are valid for this card/target/playingType as used, and remove them if they have no uses remaining
     * @param {PlayType} playingType
     * @param {Card} card DrawCard
     * @param {AbilityContext} context
     * @param {Card=} target BaseCard
     * @param {Aspect=} aspects
     */
    markUsedAdjusters(playingType, card, context, target = null, aspects = null) {
        var matchingAdjusters = this.costAdjusters.filter((adjuster) => adjuster.canAdjust(playingType, card, context, target, aspects));
        matchingAdjusters.forEach((adjuster) => {
            adjuster.markUsed();
            if (adjuster.isExpired()) {
                this.removeCostAdjuster(adjuster);
            }
        });
    }

    /**
     * Called at the start of the Action Phase.  Resets some of the single round parameters
     */
    resetForActionPhase() {
        if (this.resetTimerAtEndOfRound) {
            this.noTimer = false;
        }
        this.passedActionPhase = false;
    }

    /**
     * Called at the end of the Action Phase.  Resets some of the single round parameters
     */
    cleanupFromActionPhase() {
        this.passedActionPhase = null;
    }

    // showDeck() {
    //     this.showDeck = true;
    // }

    // /**
    //  * Called when a player drags and drops a card from one zone on the client to another
    //  * @param {String} cardId - the uuid of the dropped card
    //  * @param source
    //  * @param target
    //  */
    // drop(cardId, source, target) {
    //     var sourceList = this.getCardPile(source);
    //     var card = this.findCardByUuid(sourceList, cardId);

    //     // Dragging is only legal in manual mode, when the card is currently in source, when the source and target are different and when the target is a legal zone
    //     if (
    //         !this.game.manualMode ||
    //         source === target ||
    //         !this.isLegalZoneForCardTypes(card.types, target) ||
    //         card.zoneName !== source
    //     ) {
    //         return;
    //     }

    //     // Don't allow two province cards in one province
    //     if (
    //         card.isProvince &&
    //         target !== ZoneName.ProvinceDeck &&
    //         this.getCardPile(target).any((card) => card.isProvince)
    //     ) {
    //         return;
    //     }

    //     let display = 'a card';
    //     if (
    //         (card.isFaceup() && source !== ZoneName.Hand) ||
    //         [
    //             ZoneName.PlayArea,
    //             ZoneName.DynastyDiscardPile,
    //             ZoneName.ConflictDiscardPile,
    //             ZoneName.RemovedFromGame
    //         ].includes(target)
    //     ) {
    //         display = card;
    //     }

    //     this.game.addMessage('{0} manually moves {1} from their {2} to their {3}', this, display, source, target);
    //     this.moveCard(card, target);
    //     this.game.resolveGameState(true);
    // }

    /**
     * Checks whether card type is consistent with zone, checking for custom out-of-play zones
     * @param {CardType} cardType
     * @param {ZoneName | import('./Constants').MoveZoneDestination} zone
     */
    isLegalZoneForCardType(cardType, zone) {
        const legalZonesForType = Helpers.defaultLegalZonesForCardTypeFilter(cardType);

        return legalZonesForType && EnumHelpers.cardZoneMatches(EnumHelpers.asConcreteZone(zone), legalZonesForType);
    }

    /**
     * This is only used when an upgrade is dragged into play.  Usually,
     * upgrades are played by playCard()
     * @deprecated
     */
    promptForUpgrade(card, playingType) {
        this.game.queueStep(new UpgradePrompt(this.game, this, card, playingType));
    }

    // get skillModifier() {
    //     return this.getOngoingEffectValues(EffectName.ChangePlayerSkillModifier).reduce((total, value) => total + value, 0);
    // }

    /**
     * Called by the game when the game starts, sets the players decklist
     * @param {Deck} deck
     */
    selectDeck(deck) {
        this.decklistNames = deck;
    }

    // TODO NOISY PR: rearrange this file into sections
    get hand() {
        return this.handZone.cards;
    }

    get discard() {
        return this.discardZone.cards;
    }

    get resources() {
        return this.resourceZone.cards;
    }

    get drawDeck() {
        return this.deckZone?.deck;
    }

    /**
     * Returns the number of resources available to spend
     */
    get readyResourceCount() {
        return this.resourceZone.readyResourceCount;
    }

    /**
     * Returns the number of exhausted resources
     */
    get exhaustedResourceCount() {
        return this.resourceZone.exhaustedResourceCount;
    }

    /**
     * Moves a card from its current zone to the resource zone
     * @param {import('./card/baseClasses/PlayableOrDeployableCard').ICardWithExhaustProperty} card BaseCard
     * @param {boolean} exhaust Whether to exhaust the card. True by default.
     */
    resourceCard(card, exhaust = true) {
        card.moveTo(ZoneName.Resource);
        card.exhausted = exhaust;
    }

    /**
     * Exhaust the specified number of resources
     * @param {number} count
     * @param {import('./card/baseClasses/PlayableOrDeployableCard').ICardWithExhaustProperty[]} [priorityResources=[]]
     */
    // TODO: Create an ExhaustResourcesSystem
    exhaustResources(count, priorityResources = []) {
        const readyPriorityResources = priorityResources.filter((resource) => !resource.exhausted);
        const regularResourcesToReady = count - this.exhaustResourcesInList(readyPriorityResources, count);

        if (regularResourcesToReady > 0) {
            const readyRegularResources = this.resourceZone.readyResources;
            this.exhaustResourcesInList(readyRegularResources, regularResourcesToReady);
        }
    }

    /**
     * Returns how many resources were readied
     * @param {import('./card/baseClasses/PlayableOrDeployableCard').ICardWithExhaustProperty[]} resources
     * @param {number} count
     * @returns {number}
     */
    exhaustResourcesInList(resources, count) {
        if (count < resources.length) {
            resources.slice(0, count).forEach((resource) => resource.exhaust());
            return count;
        }

        resources.forEach((resource) => resource.exhaust());
        return resources.length;
    }

    /**
     * Ready the specified number of resources
     * @param {number} count
     */
    readyResources(count) {
        let exhaustedResources = this.resourceZone.exhaustedResources;
        for (let i = 0; i < Math.min(count, exhaustedResources.length); i++) {
            exhaustedResources[i].exhausted = false;
        }
    }

    /**
     * If possible, exhaust the given resource and ready another one instead
     * @param {import('./card/baseClasses/PlayableOrDeployableCard').ICardWithExhaustProperty} resource
     */
    swapResourceReadyState(resource) {
        Contract.assertTrue(resource.zoneName === ZoneName.Resource, 'Tried to exhaust a resource that is not in the resource zone');

        // The resource is already exhausted, do nothing
        if (resource.exhausted) {
            return;
        }

        // Find an exhausted resource to ready and swap the status
        let exhaustedResource = this.resources.find((card) => card.exhausted);
        if (exhaustedResource) {
            resource.exhaust();
            exhaustedResource.ready();
        }
    }

    /**
     * @param {AbilityContext} context
     * @param {number} amount
     */
    getRandomResources(context, amount) {
        this.resourceZone.rearrangeResourceExhaustState(context);
        return this.resourceZone.getCards().splice(0, amount);
    }

    get selectableCards() {
        return this.promptState.selectableCards;
    }

    get selectedCards() {
        return this.promptState.selectedCards;
    }

    /**
     * Sets the passed cards as selected
     * @param {Card[]} cards
     */
    setSelectedCards(cards) {
        this.promptState.setSelectedCards(cards);
    }

    clearSelectedCards() {
        this.promptState.clearSelectedCards();
    }

    /**
     * @param {Card[]} cards
     */
    setSelectableCards(cards) {
        this.promptState.setSelectableCards(cards);
    }

    clearSelectableCards() {
        this.promptState.clearSelectableCards();
    }

    getSummaryForHand(list, activePlayer) {
        // if (this.optionSettings.sortHandByName) {
        //     return this.getSortedSummaryForCardList(list, activePlayer);
        // }
        return this.getSummaryForZone(list, activePlayer);
    }

    /**
     * @param {ZoneName} zone
     * @param {Player} activePlayer
     */
    getSummaryForZone(zone, activePlayer) {
        const zoneCards = zone === ZoneName.Deck
            ? this.drawDeck
            : this.getCardsInZone(zone);

        return zoneCards?.map((card) => {
            return card.getSummary(activePlayer);
        }) ?? [];
    }

    getSortedSummaryForCardList(list, activePlayer) {
        let cards = list.map((card) => card);
        cards.sort((a, b) => a.printedName.localeCompare(b.printedName));

        return cards.map((card) => {
            return card.getSummary(activePlayer);
        });
    }

    /**
     * @param {Card} card
     */
    getCardSelectionState(card) {
        return this.promptState.getCardSelectionState(card);
    }

    currentPrompt() {
        return this.promptState.getState();
    }

    setPrompt(prompt) {
        this.promptState.setPrompt(prompt);
    }

    cancelPrompt() {
        this.promptState.cancelPrompt();
    }

    isTopCardShown(activePlayer = undefined) {
        if (!activePlayer) {
            activePlayer = this;
        }

        if (activePlayer.drawDeck && activePlayer.drawDeck.size() <= 0) {
            return false;
        }

        if (activePlayer === this) {
            return (
                this.getOngoingEffectValues(EffectName.ShowTopCard).includes(WildcardRelativePlayer.Any) ||
                this.getOngoingEffectValues(EffectName.ShowTopCard).includes(RelativePlayer.Self)
            );
        }

        return (
            this.getOngoingEffectValues(EffectName.ShowTopCard).includes(WildcardRelativePlayer.Any) ||
            this.getOngoingEffectValues(EffectName.ShowTopCard).includes(RelativePlayer.Opponent)
        );
    }

    // eventsCannotBeCancelled() {
    //     return this.hasOngoingEffect(EffectName.EventsCannotBeCancelled);
    // }

    // // TODO STATE SAVE: what stats are we interested in?
    // getStats() {
    //     return {
    //         fate: this.fate,
    //         honor: this.getTotalHonor(),
    //         conflictsRemaining: this.getConflictOpportunities(),
    //         militaryRemaining: this.getRemainingConflictOpportunitiesForType(ConflictTypes.Military),
    //         politicalRemaining: this.getRemainingConflictOpportunitiesForType(ConflictTypes.Political)
    //     };
    // }

    // TODO STATE SAVE: clean this up
    // /**
    //  * This information is passed to the UI
    //  * @param {Player} activePlayer
    //  */
    getState(activePlayer) {
        let isActivePlayer = activePlayer === this;
        let promptState = isActivePlayer ? this.promptState.getState() : {};
        let { ...safeUser } = this.user;

        let isActionPhaseActivePlayer = null;
        if (this.game.actionPhaseActivePlayer != null) {
            isActionPhaseActivePlayer = this.game.actionPhaseActivePlayer === this;
        }

        let state = {
            cardPiles: {
                hand: this.getSummaryForZone(ZoneName.Hand, activePlayer),
                outsideTheGame: this.getSummaryForZone(ZoneName.OutsideTheGame, activePlayer),
                capturedZone: this.getSummaryForZone(ZoneName.Capture, activePlayer),
                resources: this.getSummaryForZone(ZoneName.Resource, activePlayer),
                groundArena: this.getSummaryForZone(ZoneName.GroundArena, activePlayer),
                spaceArena: this.getSummaryForZone(ZoneName.SpaceArena, activePlayer),
                deck: this.getSummaryForZone(ZoneName.Deck, activePlayer),
                discard: this.getSummaryForZone(ZoneName.Discard, activePlayer)
            },
            disconnected: this.disconnected,
            hasInitiative: this.hasInitiative(),
            availableResources: this.readyResourceCount,
            leader: this.leader?.getSummary(activePlayer),
            base: this.base?.getSummary(activePlayer),
            id: this.id,
            left: this.left,
            name: this.name,
            // optionSettings: this.optionSettings,
            phase: this.game.currentPhase,
            promptedActionWindows: this.promptedActionWindows,
            // stats: this.getStats(),
            user: safeUser,
            promptState: promptState,
            isActionPhaseActivePlayer
        };

        // if (this.showDeck) {
        //     state.showDeck = true;
        //     state.cardPiles.deck = this.getSummaryForZone(this.deck, activePlayer);
        // }

        // if (this.role) {
        //     state.role = this.role.getSummary(activePlayer);
        // }

        if (this.clock) {
            state.clock = this.clock.getState();
        }

        return state;
    }

    /** @override */
    toString() {
        return this.name;
    }
}

module.exports = Player;
