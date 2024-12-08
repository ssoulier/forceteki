describe('Plo Koon Kohtoyah', function () {
    integration(function (contextRef) {
        describe('Plo Koon Kohtoyah\'s ability', function () {
            it('should ambush attack for 6', function () {
                contextRef.setupTest({
                    phase: 'action',
                    player1: {
                        hand: ['plo-koon#kohtoyah'],
                        groundArena: ['obiwan-kenobi#following-fate', 'luke-skywalker#jedi-knight'],
                    },
                    player2: {
                        groundArena: ['wampa'],
                    }
                });

                const { context } = contextRef;

                context.player1.clickCard(context.ploKoon);
                context.player1.clickPrompt('Ambush');
                expect(context.wampa).toBeInZone('discard');
                expect(context.ploKoon.damage).toBe(4);
                expect(context.ploKoon.exhausted).toBeTrue();
            });

            it('should defend back for 3 damage', function () {
                contextRef.setupTest({
                    phase: 'action',
                    player1: {
                        groundArena: ['obiwan-kenobi#following-fate'],
                    },
                    player2: {
                        groundArena: ['wampa', 'luke-skywalker#jedi-knight', 'plo-koon#kohtoyah'],
                    }
                });

                const { context } = contextRef;

                context.player1.clickCard(context.obiwanKenobi);
                context.player1.clickCard(context.ploKoon);
                expect(context.obiwanKenobi.damage).toBe(3);
            });
        });
    });
});
