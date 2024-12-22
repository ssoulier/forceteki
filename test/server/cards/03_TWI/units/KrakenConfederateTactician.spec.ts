describe('Kraken Confederate Tactician', function () {
    integration(function (contextRef) {
        describe('Kraken Confederate Tactician\'s ability', function () {
            it('should create two friendly Battle Droid tokens', function () {
                contextRef.setupTest({
                    phase: 'action',
                    player1: {
                        hand: ['kraken#confederate-tactician'],
                    }
                });

                const { context } = contextRef;

                context.player1.clickCard(context.kraken);

                const battleDroids = context.player1.findCardsByName('battle-droid');
                expect(battleDroids.length).toBe(2);
                expect(battleDroids).toAllBeInZone('groundArena');
                expect(battleDroids.every((battleDroid) => battleDroid.exhausted)).toBeTrue();
                expect(context.player2.getArenaCards().length).toBe(0);
            });

            it('should give +1/+1 to friendly tokens unit on attack', function () {
                contextRef.setupTest({
                    phase: 'action',
                    player1: {
                        hand: ['droid-deployment', 'drop-in'],
                        groundArena: ['kraken#confederate-tactician']
                    },
                    player2: {
                        groundArena: ['battlefield-marine'],
                    }
                });

                const { context } = contextRef;

                // We create 2 Clone Troopers tokens
                context.player1.clickCard(context.dropIn);
                context.player2.passAction();

                // Kraken attack gives +1/+1 to all friendly tokens
                context.player1.clickCard(context.kraken);
                context.player1.clickCard(context.p2Base);
                let cloneTroopers = context.player1.findCardsByName('clone-trooper');
                expect(cloneTroopers.every((cloneTrooper) => cloneTrooper.getPower() === 3)).toBeTrue();
                expect(cloneTroopers.every((cloneTrooper) => cloneTrooper.getHp() === 3)).toBeTrue();
                context.player2.passAction();

                // But newly create token units are not impacted
                context.player1.clickCard(context.droidDeployment);
                const battleDroids = context.player1.findCardsByName('battle-droid');
                expect(battleDroids.every((battleDroid) => battleDroid.getPower() === 1)).toBeTrue();
                expect(battleDroids.every((battleDroid) => battleDroid.getHp() === 1)).toBeTrue();

                // It remains active for the Clone Troopers
                cloneTroopers = context.player1.findCardsByName('clone-trooper');
                expect(cloneTroopers.every((cloneTrooper) => cloneTrooper.getPower() === 3)).toBeTrue();
                expect(cloneTroopers.every((cloneTrooper) => cloneTrooper.getHp() === 3)).toBeTrue();

                // It stops at the end of the phase
                context.moveToNextActionPhase();
                cloneTroopers = context.player1.findCardsByName('clone-trooper');
                expect(cloneTroopers.every((cloneTrooper) => cloneTrooper.getPower() === 2)).toBeTrue();
                expect(cloneTroopers.every((cloneTrooper) => cloneTrooper.getHp() === 2)).toBeTrue();
            });
        });
    });
});
