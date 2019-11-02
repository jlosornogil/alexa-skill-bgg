/* REQUIRED LIBRARIES */
const Alexa = require('ask-sdk-core');
const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');
const bgg = require('bgg')();

/* MESSAGE CONSTANTS */
const reprompt = '¿Quieres saber algo más? Puedes decir ayuda para conocer más comandos o salir para cerrar esta aplicación.';
const notFoundSpeak = 'No he podido encontrar ningún juego con las condiciones que me pides. Por favor, inténtalo de nuevo.';
const helpSpeak = 'Puedes decir: dime la lista completa, dime los x primeros, dime los x últimos, dime del x al y, dime el detalle del número x. ¿Cómo te puedo ayudar?';

/* HANDLERS */
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        const hotnessList = await storeHotnessList(handlerInput);
        const speakOutput = `Hola, he encontrado ${hotnessList.length} juegos de los que se está hablando en <lang xml:lang="en-US">Board Game Geek</lang>. ¿Quieres escuchar la lista completa, o una parte?`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(reprompt)
            .getResponse();
    }
};
const CompleteListIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CompleteListIntent';
    },
    async handle(handlerInput) {
        const speakOutput = await getGameListSpeak(handlerInput, 0, 50);
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(reprompt)
            .getResponse();
    }
};
const FirstListItemsIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'FirstListItemsIntent';
    },
    async handle(handlerInput) {
        const endIndex = Alexa.getSlot(handlerInput.requestEnvelope, 'firstSize');
        const speakOutput = await getGameListSpeak(handlerInput, 0, endIndex.value);
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(reprompt)
            .getResponse();
    }
};
const LastListItemsIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LastListItemsIntent';
    },
    async handle(handlerInput) {
        const startIndex = Alexa.getSlot(handlerInput.requestEnvelope, 'lastSize');
        const speakOutput = await getGameListSpeak(handlerInput, 50 - (startIndex.value), 50);
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(reprompt)
            .getResponse();
    }
};
const RangeListItemsIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RangeListItemsIntent';
    },
    async handle(handlerInput) {
        const startIndex = Alexa.getSlot(handlerInput.requestEnvelope, 'startIndex');
        const endIndex = Alexa.getSlot(handlerInput.requestEnvelope, 'endIndex');
        let speakOutput = await getGameListSpeak(handlerInput, startIndex.value - 1, endIndex.value);
        if(speakOutput === '') {
            speakOutput = notFoundSpeak;
        }
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(reprompt)
            .getResponse();
    }
};
const GameDetailIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GameDetailIntent';
    },
    async handle(handlerInput) {
        const detailIndexParam = Alexa.getSlot(handlerInput.requestEnvelope, 'detailIndex');
        let speakOutput = await getGameDetailSpeak(handlerInput, detailIndexParam.value);
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(reprompt)
            .getResponse();
    }
}
const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak(helpSpeak)
            .reprompt(helpSpeak)
            .getResponse();
    }
};
const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = '¡Hasta la próxima!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder.getResponse();
    }
};
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`~~~~ Error handled: ${error.stack}`);
        const speakOutput = `Perdón, no pude hacer lo que me has pedido. Por favor, inténtalo de nuevo.`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

/* HELPER FUNCTIONS */

/**
 * Retrieve the hotness list of games from BGG API and store it as a session attribute. It stores only the identifier, rank and name of each game.
 * 
 * @param  {Object}         handlerInput    given input data coming from the intent handler
 * @return {List[Object]}                   list of hotness games from BGG
 */
async function storeHotnessList(handlerInput) {
    // Get the hotness list from BGG
    const rawResult = await bgg('hot',{type: 'boardgame'});
    var result = rawResult.items.item.map(game => ({ id: game.id, rank: game.rank, name: game.name.value }));
    // Store the list in the user's session
    const attributesManager = handlerInput.attributesManager;
    let s3Attributes = {'hotnessList':result};
    attributesManager.setPersistentAttributes(s3Attributes);
    await attributesManager.savePersistentAttributes();
    return result;
}

/**
 * Get the text to describe a list of games of the hotness list of BGG. It can be the whole list or a part of it.
 * 
 * @param  {Object}         handlerInput    given input data coming from the intent handler
 * @param  {Number}         initIndex       the initial index to retrieve from the list
 * @param  {Number}         endIndex        the last index to retrieve from the list
 * @return {String}                         Alexa's SSML text to represent the list of games
 */
async function getGameListSpeak(handlerInput, initIndex, endIndex) {
    const gamesSublist = await getGameSublist(handlerInput, initIndex, endIndex);
    return gamesSublist
                    .map(game => ` <p><emphasis level="strong">${game.rank}</emphasis> <break strength="medium"/> <lang xml:lang="en-US">${game.name}</lang></p>`)
                    .join('');
}

/**
 * Get the hotness list of BGG.
 * 
 * @param  {Object}         handlerInput    given input data coming from the intent handler
 * @return {String}                         list of hotness games from BGG
 */
async function getGameList(handlerInput) {
    const attributesManager = handlerInput.attributesManager;
    const s3Attributes = await attributesManager.getPersistentAttributes() || {};
    return s3Attributes.hotnessList;
}

/**
 * Get a sublist of the hotness list of BGG.
 * 
 * @param  {Object}         handlerInput    given input data coming from the intent handler
 * @param  {Number}         initIndex       the initial index to retrieve from the list
 * @param  {Number}         endIndex        the last index to retrieve from the list
 * @return {String}                         sublist of hotness games from BGG
 */
async function getGameSublist(handlerInput, initIndex, endIndex) {
    const gameList = await getGameList(handlerInput);
    return gameList
                .slice(initIndex, endIndex);
}

/**
 * Get the text to describe the details of a game from BGG.
 * 
 * @param  {Object}         handlerInput    given input data coming from the intent handler
 * @param  {Number}         detailIndex     the game's index inside the hotness of BGG
 * @return {String}                         Alexa's SSML text to represent the detail of the specific game
 */
async function getGameDetailSpeak(handlerInput, detailIndex) {
    const game = await getGameDetail(handlerInput, detailIndex);
    if(game) {
        const name = getName(game);
        const numberOfPlayers = getNumberOfPlayers(game);
        const designer = getDesigner(game);
        const playingTime = getPlayingTime(game);
        const category = getCategory(game);
        const mechanic = getMechanic(game);
        return `<p>${name}, es un juego ${numberOfPlayers}, ${designer} en el año ${game.yearpublished.value}.</p>${playingTime} ${category} ${mechanic}`;
    } else {
        return notFoundSpeak;
    }
}

/**
 * Get the text to describe a game's name.
 * 
 * @param  {Object}         game    given game to retrieve its name
 * @return {String}                 Alexa's SSML text to represent the game's name
 */
function getName(game) {
    return ' <lang xml:lang="en-US">' + (Array.isArray(game.name) ? game.name[0].value : game.name.value) + '</lang> ';
}

/**
 * Get the text to describe a game's number of players.
 * 
 * @param  {Object}         game    given game to retrieve its number of players
 * @return {String}                 Alexa's SSML text to represent the game's number of players
 */
function getNumberOfPlayers(game) {
    let numberOfPlayers = '';
    if(game.minplayers && game.maxplayers) {
        if(game.minplayers.value === game.maxplayers.value) {
            if(game.minplayers.value === 1) {
                numberOfPlayers = ' en solitario ';
            } else {
                numberOfPlayers = ` para ${game.minplayers.value} jugadores `;
            }
        } else {
            numberOfPlayers = ` de ${game.minplayers.value} a ${game.maxplayers.value} jugadores `;
        }
    }
    return numberOfPlayers;
}

/**
 * Get the text to describe a game's designer/s.
 * 
 * @param  {Object}         game    given game to retrieve its designer/s
 * @return {String}                 Alexa's SSML text to represent the game's designer/s
 */
function getDesigner(game) {
    let designerSpeak = '';
    const designers = game.link
                            .filter(link => link.type === 'boardgamedesigner')
                            .sort((a,b) => a.id - b.id)
                            .map(item => item.value);
    if(designers && designers.length === 1) {
        designerSpeak = ` diseñado por ${designers[0]} `;
    } else if(designers.length > 1) {
        designerSpeak = ' diseñado por ' + designers.slice(0, -1).join(', ') + ' y ' + designers.slice(-1);
    }
    return designerSpeak;
}

function getPlayingTime(game) {
    let playingTimeSpeak = '';
    if(game.minplaytime && game.maxplaytime && game.minplaytime.value !== 0 && game.maxplaytime.value !== 0) {
        if(game.minplaytime.value === game.maxplaytime.value) {
            playingTimeSpeak = `<p> El tiempo de juego es de ${game.minplaytime.value} minutos.</p>`;
        } else {
            playingTimeSpeak = `<p>El tiempo de juego es de ${game.minplaytime.value} a ${game.maxplaytime.value} minutos.</p>`;
        }
    }
    return playingTimeSpeak;
}

function getCategory(game) {
    let categorySpeak = '';
    const categories = game.link
                            .filter(link => link.type === 'boardgamecategory')
                            .sort((a,b) => a.id - b.id)
                            .map(item => '<lang xml:lang="en-US">' + item.value + '</lang>');
    if(categories && categories.length === 1) {
        categorySpeak = `<p> Está englobado en la categoría ${categories[0]}.</p>`;
    } else if(categories.length > 1) {
        categorySpeak = '<p> Está englobado en las categorías: ' + categories.slice(0, -1).join(', ') + ' y ' + categories.slice(-1) + '.</p>';
    }
    return categorySpeak; 
}

function getMechanic(game) {
    let mechanicSpeak = '';
    const mechanics = game.link
                            .filter(link => link.type === 'boardgamemechanic')
                            .sort((a,b) => a.id - b.id)
                            .map(item => '<lang xml:lang="en-US">' + item.value + '</lang>');
    if(mechanics && mechanics.length === 1) {
        mechanicSpeak = `<p> Su mecánica principal es ${mechanics[0]}.</p>`;
    } else if(mechanics.length > 1) {
        mechanicSpeak = '<p> Sus mecánicas principales son: ' + mechanics.slice(0, -1).join(', ') + ' y ' + mechanics.slice(-1) + '.</p>';
    }
    return mechanicSpeak; 
}

async function getGameDetail(handlerInput, detailIndex) {
    let gameDetail = null;
    const gameList = await getGameList(handlerInput);
    if(gameList && gameList[detailIndex - 1]) {
        const gameId = gameList[detailIndex - 1].id;
        const rawResult = await bgg('thing',{type: 'boardgame', id: gameId});
        console.log(rawResult.items.item);
        console.log(rawResult.items.item.name);
        console.log(rawResult.items.item.link);
        gameDetail = rawResult.items.item;
    }
    return gameDetail;
}

/* LAMBDA SETUP */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        CompleteListIntentHandler,
        FirstListItemsIntentHandler,
        LastListItemsIntentHandler,
        RangeListItemsIntentHandler,
        GameDetailIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler
    )
    .addErrorHandlers(
        ErrorHandler,
    )
    .withPersistenceAdapter(
        new persistenceAdapter.S3PersistenceAdapter({bucketName:process.env.S3_PERSISTENCE_BUCKET})
    )
    .lambda();
