const Alexa = require('ask-sdk-core');
const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');
const bgg = require('bgg')();

/* MESSAGE CONSTANTS */
const reprompt = '¿Quieres saber algo más? Puedes decir ayuda para conocer más comandos o salir para cerrar esta aplicación.';
const notFoundSpeak = 'No he podido encontrar ningún juego con las condiciones que me pides. Por favor, inténtalo de nuevo.';

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        const rawResult = await bgg('hot',{type: 'boardgame'});
        var result = rawResult.items.item.map(game => ({ id: game.id, rank: game.rank, name: game.name.value }));
        
        const attributesManager = handlerInput.attributesManager;
        let s3Attributes = {'hotnessList':result};
        attributesManager.setPersistentAttributes(s3Attributes);
        await attributesManager.savePersistentAttributes();
        
        const speakOutput = `Hola, he encontrado ${s3Attributes.hotnessList.length} juegos de los que se está hablando. ¿Quieres escuchar la lista completa, o una parte?`;
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
        const speakOutput = await getGameList(handlerInput, 0, 50);
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
        const speakOutput = await getGameList(handlerInput, 0, endIndex.value);
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
        const speakOutput = await getGameList(handlerInput, 50 - (startIndex.value), 50);
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
        let speakOutput = await getGameList(handlerInput, startIndex.value - 1, endIndex.value);
        console.log(speakOutput);
        if(speakOutput === '') {
            speakOutput = notFoundSpeak;
        }
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(reprompt)
            .getResponse();
    }
};
const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Puedes decir: dime la lista completa, dime los x primeros, dime los x últimos, dime del x al y. ¿Cómo te puedo ayudar?';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
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
        const speakOutput = '¡Adios!';
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
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse();
    }
};

// The intent reflector is used for interaction model testing and debugging.
// It will simply repeat the intent the user said. You can create custom handlers
// for your intents by defining them above, then also adding them to the request
// handler chain below.
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `Disparado el intent ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
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
async function getGameList(handlerInput, initIndex, endIndex) {
    console.log(JSON.stringify(handlerInput.requestEnvelope.request.intent.slots));
    const attributesManager = handlerInput.attributesManager;
    const s3Attributes = await attributesManager.getPersistentAttributes() || {};
    const games = s3Attributes.hotnessList;
    const gameList = games
                        .map(game => ` <p><emphasis level="strong">${game.rank}</emphasis> <break strength="medium"/> <lang xml:lang="en-US">${game.name}</lang></p>`)
                        .slice(initIndex, endIndex)
                        .join('');
    return gameList;
}

/* LAMBDA SETUP */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        CompleteListIntentHandler,
        FirstListItemsIntentHandler,
        LastListItemsIntentHandler,
        RangeListItemsIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler, // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
    )
    .addErrorHandlers(
        ErrorHandler,
    )
    .withPersistenceAdapter(
        new persistenceAdapter.S3PersistenceAdapter({bucketName:process.env.S3_PERSISTENCE_BUCKET})
    )
    .lambda();
