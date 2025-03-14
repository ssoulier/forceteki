describe('Death Mark', function() {
    integration(function(contextRef) {
        describe('Death Mark\'s Bounty ability', function() {
            it('should draw 2 cards', async function () {
                await contextRef.setupTestAsync({
                    phase: 'action',
                    player1: {
                        hand: ['vanquish']
                    },
                    player2: {
                        spaceArena: [{ card: 'restored-arc170', upgrades: ['death-mark'] }, 'cartel-spacer'],
                    }
                });

                const { context } = contextRef;

                context.player1.clickCard(context.vanquish);
                context.player1.clickCard(context.restoredArc170);

                const prompt = 'Collect Bounty: Draw 2 cards';
                expect(context.player1).toHavePassAbilityPrompt(prompt);
                context.player1.clickPrompt('Trigger');

                expect(context.player1.handSize).toBe(2);
                expect(context.player2).toBeActivePlayer();
            });
        });
    });
});
