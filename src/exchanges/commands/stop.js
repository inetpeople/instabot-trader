const logger = require('../../common/logger').logger;
const conditional = require('./conditional');


async function test(context, condition, value) {
    const result = await conditional(context, condition, value);
    if (result) {
        throw new Error('Abort Sequence');
    }

    return true;
}


/**
 * Continue if a condition is met
 * continue(if=condition, value=v);
 */
module.exports = (context, args) => {
    const { ex = {} } = context;

    const p = ex.assignParams({
        if: 'always',
        value: '',
    }, args);

    logger.progress(`STOP IF - ${ex.name}`);
    logger.progress(p);

    return test(context, p.if.toLowerCase(), p.value);
};
