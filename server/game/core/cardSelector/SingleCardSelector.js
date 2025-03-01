const BaseCardSelector = require('./BaseCardSelector.js');
const { WildcardCardType } = require('../Constants.js');

class SingleCardSelector extends BaseCardSelector {
    constructor(properties) {
        super(properties);

        this.numCards = 1;
    }


    /** @override */
    defaultPromptString() {
        if (this.cardTypeFilter.length === 1 && this.cardTypeFilter[0] !== WildcardCardType.Any) {
            if (this.cardTypeFilter[0] === WildcardCardType.Upgrade) {
                return 'Choose an upgrade';
            }
            return 'Choose a ' + this.cardTypeFilter[0];
        }
        return 'Choose a card';
    }

    /** @override */
    automaticFireOnSelect() {
        return true;
    }

    /** @override */
    hasReachedLimit(selectedCards) {
        return selectedCards.length >= this.numCards;
    }

    /** @override */
    hasExceededLimit(selectedCards) {
        return selectedCards.length > this.numCards;
    }

    /** @override */
    formatSelectParam(cards) {
        return cards[0] ? cards[0] : cards;
    }
}

module.exports = SingleCardSelector;
