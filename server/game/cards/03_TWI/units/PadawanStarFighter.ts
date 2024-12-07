import AbilityHelper from '../../../AbilityHelper';
import { NonLeaderUnitCard } from '../../../core/card/NonLeaderUnitCard';
import { Trait } from '../../../core/Constants';

export default class PadawanStarFighter extends NonLeaderUnitCard {
    protected override getImplementationId() {
        return {
            id: '4718895864',
            internalName: 'padawan-starfighter'
        };
    }

    protected override setupCardAbilities() {
        this.addConstantAbility({
            title: 'While you control a Force unit or a Force upgrade, this unit gets +1/+1',
            condition: (context) => context.source.controller.getOtherUnitsInPlayWithTrait(context.source, Trait.Force).length > 0 || context.source.controller.getArenaCards().filter((c) => c.isUpgrade)
                .some((c) => c.traits.has(Trait.Force)),
            ongoingEffect: AbilityHelper.ongoingEffects.modifyStats({ power: 1, hp: 1 }),
        });
    }
}

PadawanStarFighter.implemented = true;
