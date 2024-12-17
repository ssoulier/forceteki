describe('Shaak Ti Unity Wins Wars', function() {
    integration(function(contextRef) {
        it('should 1 Clone Tropper token when attack and Clone Tropper must have +1 power', function () {
            contextRef.setupTest({
                phase: 'action',
                player1: {
                    groundArena: ['shaak-ti#unity-wins-wars']

                },
                player2: {
                    groundArena: ['battlefield-marine']
                }
            });

            const { context } = contextRef;

            context.player1.clickCard(context.shaakTi);
            context.player1.clickCard(context.battlefieldMarine);

            const cloneTroopers = context.player1.findCardsByName('clone-trooper');
            expect(cloneTroopers.length).toBe(1);
            expect(cloneTroopers).toAllBeInZone('groundArena');
            expect(cloneTroopers.every((cloneTrooper) => cloneTrooper.exhausted)).toBeTrue();
            expect(cloneTroopers.every((cloneTrooper) => cloneTrooper.getPower() === 3)).toBeTrue();
            expect(cloneTroopers.every((cloneTrooper) => cloneTrooper.getHp() === 2)).toBeTrue();
        });
    });
});
