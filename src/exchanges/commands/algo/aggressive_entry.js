const uuid = require('uuid/v4');
const logger = require('../../../common/logger').logger;

/**
 * Place an aggressive entry algorithmic order
 */
module.exports = async (context, args) => {
    const { ex = {}, symbol = '', session = '' } = context;
    const p = ex.assignParams({
        side: 'buy',
        amount: '0',
        position: '',
        tag: 'aggressive',
    }, args);

    // Get the params in units we can use (numbers!)
    p.side = p.side.toLowerCase();
    p.amount = ex.roundAsset(symbol, p.amount);

    // show a little progress
    logger.progress(`AGGRESSIVE ENTRY- ${ex.name}`);
    logger.progress(p);

    // Validate the side
    if ((p.side !== 'buy') && (p.side !== 'sell')) {
        return Promise.reject(new Error('side must be buy or sell'));
    }

    // Convert a position to an amount to order (if needed)
    const modifiedPosition = await ex.positionToAmount(symbol, p.position, p.side, p.amount);
    if (modifiedPosition.amount.value === 0) {
        // Nothing to do
        logger.results('Aggressive entry order size is Zero - ignoring.');
        return Promise.resolve({});
    }

    // Capture the modified size and direction information
    const side = modifiedPosition.side;
    const amountStr = `${modifiedPosition.amount.value}${modifiedPosition.amount.units}`;

    // convert the amount to an actual order size.
    const orderPrice = await ex.offsetToAbsolutePrice(symbol, side, '0');
    const details = await ex.orderSizeFromAmount(symbol, side, orderPrice, amountStr);
    if (details.orderSize === 0) {
        return Promise.reject('No funds available or order size is zero');
    }

    const id = uuid();
    const isBuy = (side === 'buy');

    logger.results(`Aggressive entry order adjusted to side: ${side}, amount: ${details.orderSize}.`);

    // Log the algo order, so it can be cancelled
    ex.startAlgoOrder(id, side, session, p.tag);

    // Start off we no active order and the full amount still to fill
    let activeOrder = null;
    let activePrice = 0;
    let amountLeft = details.orderSize;
    let waitTime = ex.minPollingDelay;

    // The loop until there is nothing left to order
    while (amountLeft >= ex.symbolData.minOrderSize(symbol)) {
        // have we reached the expiry time of the order
        if ((ex.isAlgoOrderCancelled(id))) {
            logger.progress('aggressive entry order cancelled - stopping');
            if (activeOrder) {
                await ex.api.cancelOrders([activeOrder]);
            }

            return Promise.resolve({});
        }

        // get the current price
        const orderBook = await ex.support.ticker(context);
        const currentPrice = isBuy ? parseFloat(orderBook.bid) : parseFloat(orderBook.ask);

        if (activeOrder === null) {
            // are we the right side of the limit price?
            // Figure out how big the order should be (90% to 110% of average amount)
            const amount = ex.roundAsset(symbol, amountLeft);

            // figure out some prices for the order
            const now = new Date().toISOString();
            logger.info(`${amountLeft} of Aggressive Entry Order still to fill at ${now}`);
            logger.info(`Placing order for ${amount} at ${currentPrice}.`);

            // place a new limit order
            const orderParams = [
                { name: 'side', value: side, index: 0 },
                { name: 'amount', value: `${amount}`, index: 1 },
                { name: 'offset', value: `@${currentPrice}`, index: 2 },
                { name: 'postOnly', value: 'true', index: 3 },
            ];
            const order = await ex.executeCommand(symbol, 'limitOrder', orderParams, session);

            activeOrder = order.order;
            activePrice = currentPrice;
            waitTime = ex.minPollingDelay + 2;
        } else {
            // There is already an open order, so see if it's filled yet
            const orderInfo = await ex.api.order(activeOrder);
            if (orderInfo !== null) {
                if (orderInfo.is_filled) {
                    logger.progress('Aggressive Entry: filled');
                    amountLeft -= orderInfo.executed;
                    activeOrder = null;
                    waitTime = ex.minPollingDelay;
                } else if (!orderInfo.is_open) {
                    logger.progress('Aggressive Entry order: cancelled - aborting entire order');
                    return Promise.resolve({});
                } else if (activePrice !== currentPrice) {
                    logger.progress('Aggressive Entry order: No longer at top of book - moving');
                    await ex.api.cancelOrders([activeOrder]);
                    amountLeft -= orderInfo.executed;
                    activeOrder = null;
                    activePrice = 0;
                    waitTime = ex.minPollingDelay;
                }
            } else {
                logger.progress('Aggressive Entry order: waiting for order status');
            }
        }

        // wait for a bit before deciding what to do next
        await ex.waitSeconds(waitTime);
        if (waitTime < ex.maxPollingDelay) waitTime += 1;
    }

    ex.endAlgoOrder(id);
    logger.results('Aggressive entry order complete');
    return Promise.resolve({});
};

