import { NonLeaderUnitCard } from '../../../core/card/NonLeaderUnitCard';
import { AbilityType } from '../../../enums/AbilityType';
import { PlayType } from '../../../enums/PlayType';
import { TargetType } from '../../../enums/TargetType';

export default class HanSoloHasHisMoments extends NonLeaderUnitCard {
    protected override getImplementationId () {
        return {
            id: '6720065735',
            internalName: 'han-solo#has-his-moments',
        };
    }

    public override setupCardAbilities () {
        this.addPilotingAbility({
            title: 'Attack with attached unit. If it\'s the Millennium Falcon, it deals its combat damage before the defender.',
            type: AbilityType.Triggered,
            when: {
                onCardPlayed: (event, context) =>
                    event.card === context.source &&
                    event.playType === PlayType.Piloting
            },
            optional: true,
            target: {
                type: TargetType.Unit,
                controller: 'opponent',
                cardCondition: (card) => card.isInBattle()
            },
            handler: (context) => {
                const pilotedUnit = context.source.parent;
                if (!pilotedUnit) {
                    return;
                }

                const isMillenniumFalcon = pilotedUnit.name.toLowerCase().includes('millennium falcon');

                this.game.addMessage('{0} uses {1} to attack with {2}', context.player, context.source, pilotedUnit);

                if (isMillenniumFalcon) {
                    this.game.addMessage('{0} deals combat damage before the defender', pilotedUnit);
                    // Implementation for first strike effect
                    this.game.initiateUnitCombat({
                        attacker: pilotedUnit,
                        defender: context.target,
                        firstStrike: true
                    });
                } else {
                    // Normal combat without first strike
                    this.game.initiateUnitCombat({
                        attacker: pilotedUnit,
                        defender: context.target
                    });
                }
            }
        });
    }
}