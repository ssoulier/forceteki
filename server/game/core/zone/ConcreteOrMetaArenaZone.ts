import type { IInPlayCard } from '../card/baseClasses/InPlayCard';
import type { IUnitCard } from '../card/propertyMixins/UnitProperties';
import type { UpgradeCard } from '../card/UpgradeCard';
import { WildcardCardType } from '../Constants';
import type Game from '../Game';
import type Player from '../Player';
import type { IZoneCardFilterProperties } from './ZoneAbstract';
import { ZoneAbstract } from './ZoneAbstract';

export interface IArenaZoneCardFilterProperties extends IZoneCardFilterProperties {
    controller?: Player;
}

/**
 * Base class for arena zones, including the meta-zone for all arenas
 */
export abstract class ConcreteOrMetaArenaZone extends ZoneAbstract<IInPlayCard> {
    public override readonly hiddenForPlayers: null;
    public override readonly owner: Game;

    public abstract override get cards(): IInPlayCard[];

    public constructor(owner: Game) {
        super(owner);
    }

    public abstract override getCards(filter?: IArenaZoneCardFilterProperties): IInPlayCard[];

    public override hasSomeCard(filter: IArenaZoneCardFilterProperties): boolean {
        return super.hasSomeCard(filter);
    }

    public getUnitCards(filter?: Omit<IArenaZoneCardFilterProperties, 'type'>): IUnitCard[] {
        return this.getCards({ ...filter, type: WildcardCardType.Unit }) as IUnitCard[];
    }

    public getUpgradeCards(filter?: Omit<IArenaZoneCardFilterProperties, 'type'>): UpgradeCard[] {
        return this.getCards({ ...filter, type: WildcardCardType.Upgrade }) as UpgradeCard[];
    }
}
