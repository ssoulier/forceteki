import AbilityHelper from '../../../AbilityHelper';
import { NonLeaderUnitCard } from '../../../core/card/NonLeaderUnitCard';
import { Location } from '../../../core/Constants';

export default class WildRancor extends NonLeaderUnitCard {
    protected override getImplementationId () {
        return {
            id: '9270539174',
            internalName: 'wild-rancor'
        };
    }

    public override setupCardAbilities () {
        this.addWhenPlayedAbility({
            title: 'Deal 2 damage to each other ground unit',
            immediateEffect: AbilityHelper.immediateEffects.damage((context) => ({
                target: context.source.controller.getOtherUnitsInPlay(context.source, Location.GroundArena).concat(context.source.controller.opponent.getUnitsInPlay(Location.GroundArena)),
                amount: 2
            }))
        });
    }
}

WildRancor.implemented = true;
