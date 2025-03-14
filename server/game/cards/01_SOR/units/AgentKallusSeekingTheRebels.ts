import AbilityHelper from '../../../AbilityHelper';
import { NonLeaderUnitCard } from '../../../core/card/NonLeaderUnitCard';

export default class AgentKallusSeekingTheRebels extends NonLeaderUnitCard {
    protected override getImplementationId() {
        return {
            id: '2649829005',
            internalName: 'agent-kallus#seeking-the-rebels',
        };
    }

    public override setupCardAbilities() {
        this.addTriggeredAbility({
            title: 'Draw a card',
            optional: true,
            when: {
                onCardDefeated: (event, context) =>
                    event.card.isUnit() &&
                    event.card.unique &&
                    event.card !== context.source
            },
            immediateEffect: AbilityHelper.immediateEffects.draw(),
            limit: AbilityHelper.limit.perRound(1)
        });
    }
}
