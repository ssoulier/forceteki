import AbilityHelper from '../../../AbilityHelper';
import { EventCard } from '../../../core/card/EventCard';

export default class EncouragingLeadership extends EventCard {
    protected override getImplementationId () {
        return {
            id: '4916334670',
            internalName: 'encouraging-leadership'
        };
    }

    public override setupCardAbilities() {
        this.setEventAbility({
            title: 'Give each friendly unit +1/+1 for this phase.',
            immediateEffect: AbilityHelper.immediateEffects.forThisPhaseCardEffect((context) => ({
                target: context.player.getArenaUnits(),
                effect: AbilityHelper.ongoingEffects.modifyStats({ power: 1, hp: 1 }),
            })),
        });
    }
}
