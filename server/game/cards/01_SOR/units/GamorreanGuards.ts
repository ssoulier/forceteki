import AbilityHelper from '../../../AbilityHelper';
import { NonLeaderUnitCard } from '../../../core/card/NonLeaderUnitCard';
import { Aspect, KeywordName } from '../../../core/Constants';

export default class GamorreanGuards extends NonLeaderUnitCard {
    protected override getImplementationId () {
        return {
            id: '2739464284',
            internalName: 'gamorrean-guards'
        };
    }

    public override setupCardAbilities () {
        this.addConstantAbility({
            title: 'While you control another Cunning unit, this unit gains Sentinel',
            condition: (context) => context.player.isAspectInPlay(Aspect.Cunning, context.source),
            matchTarget: (card, context) => card === context.source,
            ongoingEffect: AbilityHelper.ongoingEffects.gainKeyword(KeywordName.Sentinel)
        });
    }
}
