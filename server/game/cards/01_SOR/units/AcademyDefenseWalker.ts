import AbilityHelper from '../../../AbilityHelper';
import { NonLeaderUnitCard } from '../../../core/card/NonLeaderUnitCard';
import type { IUnitCard } from '../../../core/card/propertyMixins/UnitProperties';
import { WildcardZoneName } from '../../../core/Constants';

export default class AcademyDefenseWalker extends NonLeaderUnitCard {
    protected override getImplementationId() {
        return {
            id: '7596515127',
            internalName: 'academy-defense-walker'
        };
    }

    public override setupCardAbilities() {
        this.addWhenPlayedAbility({
            title: 'Give an Experience token to each friendly damaged unit',
            immediateEffect: AbilityHelper.immediateEffects.giveExperience((context) => ({
                target: context.player.getUnitsInPlay(WildcardZoneName.AnyArena, (unit: IUnitCard) => unit.damage > 0)
            }))
        });
    }
}
