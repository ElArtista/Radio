var AudioContext = window.AudioContext || window.webkitAudioContext;
var context = new AudioContext();
var dispContext = new AudioContext();
var gainNode;
var audioBuffer;
var audioStream;
var audioSource;
var audioStack = [];
var dispBufferSource;
var analyzer;
var dispScriptProcessor;
var scriptProcessor;

// Safari does not play well with createMediaElementSource :(
var is_safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

function setupAudioNodes() {
    if (!is_safari) {
        audioStream = new Audio();
        audioStream.loop = true
        audioStream.crossOrigin = 'anonymous'
        audioSource = context.createMediaElementSource(audioStream);
    } else {
        audioSource = context.createBufferSource();
    }
    audioSource.onended = function() {
        if (started && isPlaying) {
            location.reload(); // refresh when the song ends
        }
    };
    audioSource.connect(context.destination);

    muteGainNode = context.createGain();
    muteGainNode.gain.value = -1;
    audioSource.connect(muteGainNode);
    muteGainNode.connect(context.destination);

    gainNode = context.createGain();
    gainNode.gain.value = 0;
    var vol = getCookie('volume');
    if (vol != null) {
        gainNode.gain.value = vol;
    }

    delayNode = context.createDelay(1);
    delayNode.delayTime.value = audioDelay;
    audioSource.connect(gainNode);
    gainNode.connect(delayNode);
    audioSource.connect(delayNode);
    delayNode.connect(context.destination);

    scriptProcessor = context.createScriptProcessor(bufferInterval, 1, 1);
    scriptProcessor.connect(context.destination);

    analyzer = context.createAnalyser();
    analyzer.connect(scriptProcessor);
    analyzer.smoothingTimeConstant = temporalSmoothing;
    analyzer.minDecibels = -100;
    analyzer.maxDecibels = -33;
    try {
        analyzer.fftSize = maxFftSize; // ideal bin count
        console.log('Using fftSize of ' + analyzer.fftSize + ' (woot!)');
    } catch (ex) {
        analyzer.fftSize = 2048; // this will work for most if not all systems
        console.log('Using fftSize of ' + analyzer.fftSize);
        //alert('Could not set optimal fftSize! This may look a bit weird...');
    }
    audioSource.connect(analyzer);
}

function playSound(stream) {
    if (!is_safari) {
        audioStream.src = stream;
        audioStream.play();
    } else {
        var nextTime = 0;
        fetch(stream, {mode: 'cors'}).then(function(response) {
            var reader = response.body.getReader();
            function read() {
                return reader.read().then(function(value, done) {
                    if (done) {
                        console.log('done');
                        return;
                    } else {
                        //console.log(value, done);
                        context.decodeAudioData(value.buffer,
                            function(buffer) {
                                audioStack.push(buffer);
                                if (audioStack.length) {
                                    // Schedule buffers
                                    while (audioStack.length) {
                                        var buffer    = audioStack.shift();
                                        var source    = context.createBufferSource();
                                        source.buffer = buffer;
                                        source.connect(context.destination);
                                        if (nextTime == 0)
                                            nextTime = context.currentTime + 0.01;  // add 50ms latency to work well across systems
                                        source.start(nextTime);
                                        // Make the next buffer wait the length of the last buffer before being played
                                        nextTime += source.buffer.duration;
                                    };
                                }
                            }, function(err) {
                                console.log("err(decodeAudioData): " + err);
                            }
                        );
                    }
                    read();
                });
            };
            read();
        })
    }

    $('#status').fadeOut(); // will first fade out the loading animation
    $('#preloader').fadeOut('slow'); // will fade out the grey DIV that covers the website.
    $("body").addClass("playing");
    $('#spectrum_preloader').hide();
    //$('#loading-info').fadeOut(); // fades out the loading text
    isPlaying = true;
    begun = true;
    started = Date.now();
}
