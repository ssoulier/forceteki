describe('Kanan Jarrus, Revealed Jedi', function() {
    integration(function(contextRef) {
        describe('Kanan\'s On Attack ability', function() {
            beforeEach(function () {
                return contextRef.setupTestAsync({
                    phase: 'action',
                    player1: {
                        base: { card: 'chopper-base', damage: 5 },
                        groundArena: ['kanan-jarrus#revealed-jedi'],
                        leader: 'hera-syndulla#spectre-two',
                    },
                    player2: {
                        deck: ['battlefield-marine', 'pyke-sentinel', 'underworld-thug', 'the-chaos-of-war', 'volunteer-soldier']
                    },

                    // IMPORTANT: this is here for backwards compatibility of older tests, don't use in new code
                    autoSingleTarget: true
                });
            });

            it('should discard 1 card when he is only Spectre unit and should heal for its aspects', function () {
                const { context } = contextRef;

                expect(context.player2.deck.length).toBe(5);

                context.player1.clickCard(context.kananJarrus);
                expect(context.player1).toHavePassAbilityPrompt('Discard a card from the defending player\'s deck for each Spectre you control. Heal 1 damage for each aspect among the discarded cards.');
                context.player1.clickPrompt('Trigger');
                expect(context.player2.base.damage).toBe(4);

                // Check mill and heal
                expect(context.player2.deck.length).toBe(4);
                expect(context.player1.base.damage).toBe(3);
            });
        });

        describe('Kanan\'s On Attack ability', function() {
            beforeEach(function () {
                return contextRef.setupTestAsync({
                    phase: 'action',
                    player1: {
                        base: { card: 'chopper-base', damage: 5 },
                        groundArena: ['kanan-jarrus#revealed-jedi', 'sabine-wren#explosives-artist', 'chopper#metal-menace'],
                        leader: 'hera-syndulla#spectre-two',
                    },
                    player2: {
                        deck: ['battlefield-marine', 'the-chaos-of-war', 'volunteer-soldier', 'pyke-sentinel', 'underworld-thug']
                    },

                    // IMPORTANT: this is here for backwards compatibility of older tests, don't use in new code
                    autoSingleTarget: true
                });
            });

            it('should discard 3 cards when there are 3 Spectres and heal for every aspect discarded', function () {
                const { context } = contextRef;

                expect(context.player2.deck.length).toBe(5);

                context.player1.clickCard(context.kananJarrus);
                expect(context.player1).toHavePassAbilityPrompt('Discard a card from the defending player\'s deck for each Spectre you control. Heal 1 damage for each aspect among the discarded cards.');
                context.player1.clickPrompt('Trigger');
                expect(context.player2.base.damage).toBe(4);

                // Check mill and heal
                expect(context.player2.deck.length).toBe(2);

                // Should heal 3 for Command, Heroism, Aggression
                expect(context.battlefieldMarine).toBeInZone('discard');
                expect(context.theChaosOfWar).toBeInZone('discard');
                expect(context.volunteerSoldier).toBeInZone('discard');
                expect(context.player1.base.damage).toBe(2);
            });
        });

        describe('Kanan\'s On Attack ability', function() {
            beforeEach(function () {
                return contextRef.setupTestAsync({
                    phase: 'action',
                    player1: {
                        base: { card: 'chopper-base', damage: 5 },
                        groundArena: ['kanan-jarrus#revealed-jedi', 'sabine-wren#explosives-artist', 'chopper#metal-menace'],
                        leader: 'hera-syndulla#spectre-two',
                    },
                    player2: {
                        deck: ['battlefield-marine', 'the-chaos-of-war']
                    },

                    // IMPORTANT: this is here for backwards compatibility of older tests, don't use in new code
                    autoSingleTarget: true
                });
            });

            it('should discard as many cards as possible and not trigger draw damage for the opponent', function () {
                const { context } = contextRef;

                expect(context.player2.deck.length).toBe(2);

                context.player1.clickCard(context.kananJarrus);
                expect(context.player1).toHavePassAbilityPrompt('Discard a card from the defending player\'s deck for each Spectre you control. Heal 1 damage for each aspect among the discarded cards.');
                context.player1.clickPrompt('Trigger');

                // Check mill and heal
                expect(context.player2.deck.length).toBe(0);
                expect(context.player2.base.damage).toBe(4);

                // Should heal 3 for Command, Heroism, Aggression
                expect(context.battlefieldMarine).toBeInZone('discard');
                expect(context.theChaosOfWar).toBeInZone('discard');
                expect(context.player1.base.damage).toBe(2);
            });
        });
    });
});