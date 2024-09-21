import { Card } from '../core/card/Card';
import { StateWatcherRegistrar } from '../core/stateWatcher/StateWatcherRegistrar';
import { AttacksThisPhaseWatcher } from './AttacksThisPhaseWatcher';
import { CardsPlayedThisPhaseWatcher } from './CardsPlayedThisPhaseWatcher';
import { UnitsDefeatedThisPhaseWatcher } from './UnitsDefeatedThisPhaseWatcher';

export = {
    attacksThisPhase: (registrar: StateWatcherRegistrar, card: Card) => new AttacksThisPhaseWatcher(registrar, card),
    cardsPlayedThisPhase: (registrar: StateWatcherRegistrar, card: Card) => new CardsPlayedThisPhaseWatcher(registrar, card),
    unitsDefeatedThisPhase: (registrar: StateWatcherRegistrar, card: Card) => new UnitsDefeatedThisPhaseWatcher(registrar, card)
};