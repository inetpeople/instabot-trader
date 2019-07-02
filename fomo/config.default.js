
// Copy this file to config.local.js and update it
window.fomoConfig = {
    // Set the endpoint of the instabot trader instance that will receive commands
    endpoint: 'http://localhost:3000/trade',

    // a list of all the target exchange : symbol pairs to be available in the dropdown
    exchanges: [
        {
            name: 'Deribit Perps',
            value: 'deribit:BTC-PERPETUAL',
        },
    ],
};
