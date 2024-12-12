describe('Independent Senator', function () {
    integration(function (contextRef) {
        describe('Independent Senator\'s ability', function () {
            it('should heal 2 damage from a unit or a base', function () {
                contextRef.setupTest({
                    phase: 'action',
                    player1: {
                        groundArena: ['independent-senator']
                    },
                    player2: {
                        groundArena: ['wampa', 'atst'],
                        spaceArena: ['gladiator-star-destroyer', 'green-squadron-awing']
                    }
                });

                const { context } = contextRef;

                function reset() {
                    context.player1.moveCard(context.echo, 'hand');
                    context.player2.passAction();
                }

                // Case 1: A groud areana with less than 4 power can be exhausted
                context.player1.clickCard(context.independentSenator);
                context.player1.clickPrompt('Exhaust a unit with 4 or less power.');

                // can choose any units or base
                expect(context.player1).toBeAbleToSelectExactly([context.greenSquadronAwing, context.wampa, context.independentSenator]);

                // Exhaust green squadron A wing
                expect(context.greenSquadronAwing.exhausted).toBeFalse();
                context.player1.clickCard(context.greenSquadronAwing);
                expect(context.greenSquadronAwing.exhausted).toBeTrue();
                expect(context.independentSenator.exhausted).toBeTrue();
                expect(context.player1.exhaustedResourceCount).toBe(2);
            });
        });
    });
});
