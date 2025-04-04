import AbilityHelper from '../../../AbilityHelper';
import type { AbilityContext } from '../../../core/ability/AbilityContext';
import { NonLeaderUnitCard } from '../../../core/card/NonLeaderUnitCard';
import { AbilityType, Trait } from '../../../core/Constants';

export default class NienNunbLoyalCoPilot extends NonLeaderUnitCard {
    protected override getImplementationId () {
        return {
            id: '6610553087',
            internalName: 'nien-nunb#loyal-copilot',
        };
    }

    private getOtherFriendlyPilotUnitsAndUpgradesCount(context: AbilityContext) {
        // Check for other friendly Pilot units and upgrades -- and make sure we don't count this card (subtract 1)
        return context.player.getArenaCards({ trait: Trait.Pilot }).length - 1;
    }

    public override setupCardAbilities () {
        this.addConstantAbility({
            title: 'This unit gets +1/+0 for each other friendly Pilot unit and upgrade.',
            ongoingEffect: AbilityHelper.ongoingEffects.modifyStats((_target, context) => ({
                power: this.getOtherFriendlyPilotUnitsAndUpgradesCount(context), hp: 0
            }))
        });

        this.addPilotingGainAbilityTargetingAttached({
            type: AbilityType.Constant,
            title: 'Attached unit gets +1/+0 for each other friendly Pilot unit and upgrade.',
            ongoingEffect: AbilityHelper.ongoingEffects.modifyStats((_target, context) => ({
                power: this.getOtherFriendlyPilotUnitsAndUpgradesCount(context), hp: 0
            }))
        });
    }
}