import AbilityHelper from '../../../AbilityHelper';
import { UpgradeCard } from '../../../core/card/UpgradeCard';

export default class OldAccessCodes extends UpgradeCard {
    protected override getImplementationId () {
        return {
            id: '3840495762',
            internalName: 'old-access-codes',
        };
    }

    public override setupCardAbilities () {
        this.addWhenPlayedAbility({
            title: 'Draw a card',
            immediateEffect: AbilityHelper.immediateEffects.conditional({
                condition: (context) => context.player.getArenaUnits().length < context.player.opponent.getArenaUnits().length,
                onTrue: AbilityHelper.immediateEffects.draw(),
            })
        });
    }
}
