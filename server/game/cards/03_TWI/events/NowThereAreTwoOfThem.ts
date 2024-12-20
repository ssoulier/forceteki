import { EventCard } from '../../../core/card/EventCard';
import AbilityHelper from '../../../AbilityHelper';
import { WildcardCardType, ZoneName } from '../../../core/Constants';
import { StateWatcherRegistrar } from '../../../core/stateWatcher/StateWatcherRegistrar';
import { CardsPlayedThisPhaseWatcher } from '../../../stateWatchers/CardsPlayedThisPhaseWatcher';
import { TargetResolver } from '../../../core/ability/abilityTargets/TargetResolver';

export default class NowThereAreTwoOfThem extends EventCard {
    private cardsPlayedThisPhaseWatcher: CardsPlayedThisPhaseWatcher;

    protected override getImplementationId() {
        return {
            id: '6849037019',
            internalName: 'now-there-are-two-of-them'
        };
    }

    protected override setupStateWatchers(registrar: StateWatcherRegistrar): void {
        this.cardsPlayedThisPhaseWatcher = AbilityHelper.stateWatchers.cardsPlayedThisPhase(registrar, this);
    }

    public override setupCardAbilities() {
        this.setEventAbility({
            title: 'If you control exactly one unit, play a non-Vehicle unit from your hand that shares a Trait with the unit you control. It costs {R5} less.',
            immediateEffect: AbilityHelper.immediateEffects.conditional({
                condition: (context) => context.source.controller.getUnitsInPlay().length === 1,
                onFalse: AbilityHelper.immediateEffects.noAction(),
                onTrue: AbilityHelper.immediateEffects.playCardFromHand({
                    target: (card) => card.g

                    })
                }) 
            })
            })
            targetResolver: {
                cardTypeFilter: WildcardCardType.Unit,
                cardCondition: (card) => this.cardsPlayedThisPhaseWatcher.someCardPlayed((entry) => entry.card === card),
                immediateEffect: AbilityHelper.immediateEffects.forThisPhaseCardEffect({
                    effect: AbilityHelper.ongoingEffects.modifyStats({ power: -4, hp: -4 })
                })
            }
        });

        this.setEventAbility({
            title: 'Look at the top card of your deck',
            immediateEffect: AbilityHelper.immediateEffects.lookAt((context) => ({
                target: context.source.controller.getTopCardOfDeck()
            })),
            ifYouDo: (ifYouDoContext) => ({
                title: ifYouDoContext.source.controller.base.remainingHp <= 5
                    ? `Play ${ifYouDoContext.source.controller.getTopCardOfDeck().title} for free`
                    : `Play ${ifYouDoContext.source.controller.getTopCardOfDeck().title}, it costs 5 less`,
                optional: true,
                immediateEffect: AbilityHelper.immediateEffects.conditional({
                    condition: (context) => context.source.controller.base.remainingHp <= 5,
                    onTrue: AbilityHelper.immediateEffects.playCardFromOutOfPlay((context) => ({
                        target: context.source.controller.getTopCardOfDeck(),
                        adjustCost: { costAdjustType: CostAdjustType.Free }
                    })),
                    onFalse: AbilityHelper.immediateEffects.playCardFromOutOfPlay((context) => ({
                        target: context.source.controller.getTopCardOfDeck(),
                        adjustCost: { costAdjustType: CostAdjustType.Decrease, amount: 5 }
                    }))
                })
            })
        });

        this.addActionAbility({
            title: 'Play a unit from your hand. It costs 1 less',
            cost: AbilityHelper.costs.exhaustSelf(),
            targetResolver: {
                cardTypeFilter: CardType.BasicUnit,
                zoneFilter: ZoneName.Hand,
                immediateEffect: AbilityHelper.immediateEffects.playCardFromHand({
                    adjustCost: { costAdjustType: CostAdjustType.Decrease, amount: 1 }
                })
            }
        });
    }
}

NowThereAreTwoOfThem.implemented = true;
