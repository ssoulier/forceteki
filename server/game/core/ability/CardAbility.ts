import type { ZoneFilter } from '../Constants';
import { AbilityType, ZoneName, RelativePlayer, WildcardZoneName, WildcardRelativePlayer } from '../Constants';
import * as Contract from '../utils/Contract';
import CardAbilityStep from './CardAbilityStep';
import * as AbilityLimit from './AbilityLimit';
import * as EnumHelpers from '../utils/EnumHelpers';
import type { Card } from '../card/Card';

export abstract class CardAbility extends CardAbilityStep {
    public readonly abilityIdentifier: string;
    public readonly gainAbilitySource: Card;
    public readonly zoneFilter: ZoneFilter | ZoneFilter[];
    public readonly printedAbility: boolean;

    public constructor(game, card, properties, type = AbilityType.Action) {
        super(game, card, properties, type);

        this.limit = properties.limit || AbilityLimit.unlimited();
        this.limit.registerEvents(game);
        this.limit.ability = this;

        this.title = properties.title;
        this.printedAbility = properties.printedAbility ?? true;
        this.zoneFilter = this.zoneOrDefault(card, properties.zoneFilter);
        this.cannotTargetFirst = !!properties.cannotTargetFirst;
        this.gainAbilitySource = properties.gainAbilitySource;

        // if an ability name wasn't provided, assume this ability was created for some one-off purpose and not attached to the card
        this.abilityIdentifier = properties.abilityIdentifier || `${this.card.internalName}_anonymous`;
    }

    private zoneOrDefault(card, zone): ZoneFilter {
        if (zone != null) {
            return zone;
        }

        if (card.isEvent()) {
            return ZoneName.Hand;
        }
        if (card.isLeader()) {
            // check that this is a gained ability - if it's a printed leader ability, it should have an explicit zoneFilter based on which side of the card it's on
            Contract.assertFalse(this.printedAbility, 'Leader card abilities must explicitly assign properties.zoneFilter for the correct active zone of the ability');

            return WildcardZoneName.AnyArena;
        }
        if (card.isBase()) {
            return ZoneName.Base;
        }
        if (card.isUnit() || card.isUpgrade()) {
            return WildcardZoneName.AnyArena;
        }

        Contract.fail(`Unknown card type for card: ${card.internalName}`);
    }

    protected controllerMeetsRequirements(context) {
        switch (this.canBeTriggeredBy) {
            case WildcardRelativePlayer.Any:
                return true;
            case RelativePlayer.Self:
                return context.player === context.source.controller;
            case RelativePlayer.Opponent:
                return context.player === context.source.controller.opponent;
            default:
                Contract.fail(`Unexpected value for relative player: ${this.canBeTriggeredBy}`);
        }
    }

    public override meetsRequirements(context, ignoredRequirements: string[] = [], thisStepOnly = false) {
        if (!ignoredRequirements.includes('player') && !this.controllerMeetsRequirements(context)) {
            return 'player';
        }

        if (
            (this.isActivatedAbility() && !this.card.canTriggerAbilities(context, ignoredRequirements)) ||
            (this.card.isEvent() && !this.card.canPlay(context, context.playType))
        ) {
            return 'cannotTrigger';
        }

        if (this.isKeywordAbility() && !this.card.canInitiateKeywords(context)) {
            return 'cannotInitiate';
        }

        if (!ignoredRequirements.includes('limit') && this.limit.isAtMax(context.player)) {
            return 'limit';
        }

        return super.meetsRequirements(context, ignoredRequirements, thisStepOnly);
    }

    public getAdjustedCost(context) {
        const resourceCost = this.getCosts(context).find((cost) => cost.getAdjustedCost);
        return resourceCost ? resourceCost.getAdjustedCost(context) : 0;
    }

    protected isInValidZone(context) {
        return this.card.isEvent()
            ? context.player.isCardInPlayableZone(context.source, context.playType)
            : EnumHelpers.cardZoneMatches(this.card.zoneName, this.zoneFilter);
    }

    private getZoneMessage(zone, context) {
        if (zone.matchTarget(/^\b[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}\b$/i)) {
            // it's a uuid
            const source = context.game.findAnyCardInPlayByUuid(zone);
            if (source) {
                return `cards set aside by ${source.name}`;
            }
            return 'out of play area';
        }
        return zone;
    }

    public override displayMessage(context, messageVerb = context.source.isEvent() ? 'plays' : 'uses') {
        if (this.properties.message) {
            let messageArgs = this.properties.messageArgs;
            if (typeof messageArgs === 'function') {
                messageArgs = messageArgs(context);
            }
            if (!Array.isArray(messageArgs)) {
                messageArgs = [messageArgs];
            }
            this.game.addMessage(this.properties.message, ...messageArgs);
            return;
        }

        const gainAbilitySource = context.ability && context.ability.gainAbilitySource;

        const gainedAbility = gainAbilitySource ? '\'s gained ability from ' : '';
        let messageArgs = [context.player, ' ' + messageVerb + ' ', context.source, gainedAbility, gainAbilitySource];
        const costMessages = this.getCosts(context)
            .map((cost) => {
                if (cost.getCostMessage && cost.getCostMessage(context)) {
                    let card = context.costs[cost.getActionName(context)];
                    if (card && card.isFacedown && card.isFacedown()) {
                        card = 'a facedown card';
                    }
                    let [format, args] = ['ERROR - MISSING COST MESSAGE', [' ', ' ']];
                    [format, args] = cost.getCostMessage(context);
                    return { message: this.game.gameChat.formatMessage(format, [card].concat(args)) };
                }
                return null;
            })
            .filter((obj) => obj);

        if (costMessages.length > 0) {
            // ,
            messageArgs.push(', ');
            // paying 3 honor
            messageArgs.push(costMessages);
        } else {
            messageArgs = messageArgs.concat(['', '']);
        }

        let effectMessage = this.properties.effect;
        let effectArgs = [];
        let extraArgs = null;
        if (!effectMessage) {
            const gameActions = this.getGameSystems(context).filter((gameSystem) => gameSystem.hasLegalTarget(context));
            if (gameActions.length > 0) {
                // effects with multiple game actions really need their own effect message
                [effectMessage, extraArgs] = gameActions[0].getEffectMessage(context);
            }
        } else {
            effectArgs.push(context.target || context.ring || context.source);
            extraArgs = this.properties.effectArgs;
        }

        if (extraArgs) {
            if (typeof extraArgs === 'function') {
                extraArgs = extraArgs(context);
            }
            effectArgs = effectArgs.concat(extraArgs);
        }

        if (effectMessage) {
            // to
            messageArgs.push(' to ');
            // discard Stoic Gunso
            messageArgs.push({ message: this.game.gameChat.formatMessage(effectMessage, effectArgs) });
        }
        this.game.addMessage('{0}{1}{2}{3}{4}{5}{6}{7}{8}', ...messageArgs);
    }

    public override isActivatedAbility() {
        return [AbilityType.Action, AbilityType.Event, AbilityType.Triggered].includes(this.type);
    }
}
