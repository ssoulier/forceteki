describe('Han Solo Has His Moments', function () {
    it('Han Solo\'s ability should allow attack with the attached unit and give first strike to Millennium Falcon', async function () {
        await contextRef.setupTestAsync({
            phase: 'action',
            player1: {
                hand: ['han-solo#has-his-moments'],
                spaceArena: ['millennium-falcon', 'x-wing-t65'],
                base: { card: 'echo-base', damage: 5 }
            },
            player2: {
                spaceArena: ['tie-fighter'],
                base: { card: 'death-star', damage: 0 }
            }
        });

        const { context } = contextRef;

        // Play Han Solo as a pilot on X-Wing
        context.player1.clickCard(context.hanSolo);
        context.player1.clickPrompt('Pilot');
        context.player1.clickCard(context.xWingT65);

        // Trigger Han's ability
        context.player1.clickCard(context.hanSolo);
        context.player1.clickPrompt('Attack with attached unit');
        context.player1.clickCard(context.tieFighter);

        // Check regular combat occurred (no first strike)
        expect(context.tieFighter.damage).toBe(context.xWingT65.getPower());
        expect(context.xWingT65.damage).toBe(context.tieFighter.getPower());
        expect(context.player2).toBeActivePlayer();

        // Setup next test - play Han on Millennium Falcon
        context.moveToNextActionPhase();

        // Reset the board for next test
        await contextRef.setupTestAsync({
            phase: 'action',
            player1: {
                hand: ['han-solo#has-his-moments'],
                spaceArena: ['millennium-falcon', 'x-wing-t65'],
                base: { card: 'echo-base', damage: 5 }
            },
            player2: {
                spaceArena: ['tie-fighter'],
                base: { card: 'death-star', damage: 0 }
            }
        });

        // Set up a scenario where tie fighter would kill Falcon in normal combat
        context.tieFighter.power = 5;
        context.millenniumFalcon.hp = 3;
        context.millenniumFalcon.power = 2;
        context.tieFighter.hp = 2;

        // Play Han Solo as a pilot on Millennium Falcon
        context.player1.clickCard(context.hanSolo);
        context.player1.clickPrompt('Pilot');
        context.player1.clickCard(context.millenniumFalcon);

        // Trigger Han's ability
        context.player1.clickCard(context.hanSolo);
        context.player1.clickPrompt('Attack with attached unit');
        context.player1.clickCard(context.tieFighter);

        // Check that first strike worked - TIE Fighter should be destroyed
        // and Millennium Falcon should be alive (no damage from dead TIE Fighter)
        expect(context.tieFighter).toBeInZone('discardPile');
        expect(context.millenniumFalcon).toBeInZone('spaceArena');
        expect(context.millenniumFalcon.damage).toBe(0);
        expect(context.player2).toBeActivePlayer();
    });

    it('Han Solo\'s ability should be optional', async function () {
        await contextRef.setupTestAsync({
            phase: 'action',
            player1: {
                hand: ['han-solo#has-his-moments'],
                spaceArena: ['x-wing-t65'],
            },
            player2: {
                spaceArena: ['tie-fighter'],
            }
        });

        const { context } = contextRef;

        // Play Han Solo as a pilot
        context.player1.clickCard(context.hanSolo);
        context.player1.clickPrompt('Pilot');
        context.player1.clickCard(context.xWingT65);

        // Check Han's ability can be passed
        context.player1.clickCard(context.hanSolo);
        expect(context.player1).toHavePassAbilityButton();
        context.player1.clickPrompt('Pass');

        // Verify no combat occurred
        expect(context.tieFighter.damage).toBe(0);
        expect(context.xWingT65.damage).toBe(0);
    });

    it('Han Solo\'s ability should only be available when attached as a pilot', async function () {
        await contextRef.setupTestAsync({
            phase: 'action',
            player1: {
                groundArena: ['han-solo#has-his-moments'],
                spaceArena: ['x-wing-t65'],
            },
            player2: {
                spaceArena: ['tie-fighter'],
            }
        });

        const { context } = contextRef;

        // Han is in play but not as a pilot, should not have ability available
        context.player1.clickCard(context.hanSolo);
        expect(context.player1.currentPrompt().menuTitle).not.toContain('Attack with attached unit');
    });
});