import { useEffect, useRef, useState } from "react";
import { Row, RowState } from "./Row";
import dictionary from "./dictionary.json";
import { Clue, clue, describeClue, violation, IsLetterAllowed} from "./clue";
import { Keyboard } from "./Keyboard";
import targetList from "./jollyPhonics.json";
import {
    describeSeed,
    dictionarySet,
    difficultyJPSet,
    Difficulty,
    pick,
    resetRng,
    seed,
    speak,
    urlParam,
} from "./util";
import { decode, encode } from "./base64";

enum GameState {
    Playing,
    Won,
    Lost,
}

interface GameProps {
    maxGuesses: number;
    hidden: boolean;
    difficulty: Difficulty;
    colorBlind: boolean;
    keyboardLayout: string;
    difficultyJP: number;
   // addiotnal lines planning for specific keyboard options only
   
   // keyboardLayout: string; SATPIN
   // keyboardLayout: string; SATPINCKEHRMD
   // keyboardLayout: string; SATPINCKEHRMDGOULFB
   // keyboardLayout: string; SATPINCKEHRMDGOULFBJ
   // keyboardLayout: string; SATPINCKEHRMDGOULFBJZWV
   // keyboardLayout: string; SATPINCKEHRMDGOULFBJZWVYX
   // keyboardLayout: string; SATPINCKEHRMDGOULFBJZWVYXQ
}

var AvailableTargets = [
    targetList.indexOf("insist"),       // SATPIN
    targetList.indexOf("are"),          // SATPIN+tricky
    targetList.indexOf("dentist"),      // SATPINCKEHRMD
    targetList.indexOf("there"),        // SATPINCKEHRMD+tricky
    targetList.indexOf("bucket"),       // SATPINCKEHRMDGOULFB
    targetList.indexOf("give"),         // SATPINCKEHRMDGOULFB+tricky
    targetList.indexOf("sweetcorn"),    // SATPINCKEHRMDGOULFBJ
    targetList.indexOf("more"),         // SATPINCKEHRMDGOULFBJ+tricky
    targetList.indexOf("goose"),        // SATPINCKEHRMDGOULFBJZWV
    targetList.indexOf("made"),         // SATPINCKEHRMDGOULFBJZWV+tricky
    targetList.indexOf("thrill"),       // SATPINCKEHRMDGOULFBJZWVYX
    targetList.indexOf("always"),       // SATPINCKEHRMDGOULFBJZWVYX+tricky
    targetList.indexOf("marbles"),      // SATPINCKEHRMDGOULFBJZWVYXQ
    targetList.indexOf("salute")        // SATPINCKEHRMDGOULFBJZWVYXQ
];

var targets = targetList.slice(0, AvailableTargets[3] + 1); // Default to SATPINCKEHRMD+tricky (4).

const minLength = 3;
const maxLength = 5;
const minDifficultyJP = 1;
const maxDifficultyJP = 14;
export var currentDifficultyJP = 4;

function randomTarget(wordLength: number): string {
   // - chat gpt says to edit this to fix bad sorting //  const eligible = targets.filter((word) => word.length === wordLength);
    const currentAllowedLetters = WhitelistedLettersByDifficulty[difficultyJP]; // Get the allowed letters for this difficulty

const eligible = targets.filter((word) =>
    word.length === wordLength && 
    [...word].every(letter => currentAllowedLetters.includes(letter))
);
// end of chat gpt edit
    let candidate: string;
    do {
        candidate = pick(eligible);
    } while (/\*/.test(candidate));
    return candidate;
}

function getChallengeUrl(target: string): string {
    return (
        window.location.origin +
        window.location.pathname +
        "?challenge=" +
        encode(target) +
        "&difficulty=" +
        currentDifficultyJP
    );
}

let initChallenge = "";
let challengeError = false;
try {
    initChallenge = decode(urlParam("challenge") ?? "").toLowerCase();
    if (initChallenge) {
        currentDifficultyJP = parseInt((urlParam("difficulty") ?? "14")); // Default to 14 if no difficulty is defined.
    }
} catch (e) {
    console.warn(e);
    challengeError = true;
}
if (initChallenge && !dictionarySet.has(initChallenge)) {
    initChallenge = "";
    challengeError = true;
}
if (initChallenge && !difficultyJPSet.has(initChallenge)) {
    initChallenge = "";
    challengeError = true
}

function parseUrlLength(): number {
    const lengthParam = urlParam("length");
    if (!lengthParam) return 4;
    const length = Number(lengthParam);
    return length >= minLength && length <= maxLength ? length : 4;
}

function parseUrlDifficultyJP(): number {
    const difficultyJPParam = urlParam("DifficultyJP");
    if (!difficultyJPParam) return 4;
    const difficultyJP = Number(difficultyJPParam);
    return difficultyJP >= minDifficultyJP && difficultyJP <= maxDifficultyJP ? difficultyJP : 4;
}

function parseUrlGameNumber(): number {
    const gameParam = urlParam("game");
    if (!gameParam) return 1;
    const gameNumber = Number(gameParam);
    return gameNumber >= 1 && gameNumber <= 1000 ? gameNumber : 1;
}

function Game(props: GameProps) {
    const [gameState, setGameState] = useState(GameState.Playing);
    const [guesses, setGuesses] = useState<string[]>([]);
    const [currentGuess, setCurrentGuess] = useState<string>("");
    const [challenge, setChallenge] = useState<string>(initChallenge);
    const [wordLength, setWordLength] = useState(
        challenge ? challenge.length : parseUrlLength());
    const [worddifficultyJP, setWorddifficultyJP] = useState(
        challenge ? challenge.length : parseUrlDifficultyJP() 
    );
    const [gameNumber, setGameNumber] = useState(parseUrlGameNumber());
    const [target, setTarget] = useState(() => {
        resetRng();
        // Skip RNG ahead to the parsed initial game number:
        for (let i = 1; i < gameNumber; i++) randomTarget(wordLength);
        return challenge || randomTarget(wordLength);
    });
    const [hint, setHint] = useState<string>(
        challengeError
            ? `Invalid challenge string, playing random game.`
            : `Make your first guess!`
    );
    const currentSeedParams = () =>
        `?seed=${seed}&length=${wordLength}&game=${gameNumber}`;
    useEffect(() => {
        if (seed) {
            window.history.replaceState(
                {},
                document.title,
                window.location.pathname + currentSeedParams()
            );
        }
    });
    const tableRef = useRef<HTMLTableElement>(null);
    const startNextGame = () => {
        if (challenge) {
            // Clear the URL parameters:
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        setChallenge("");
        const newWordLength =
            wordLength >= minLength && wordLength <= maxLength ? wordLength : 4;
        setWordLength(newWordLength);

        currentDifficultyJP = worddifficultyJP;
        setTarget(randomTarget(newWordLength));
        setHint("");
        setGuesses([]);
        setCurrentGuess("");
        setGameState(GameState.Playing);
        setGameNumber((x) => x + 1);
    };

    async function share(copiedHint: string, text?: string) {
        const url = seed
            ? window.location.origin + window.location.pathname + currentSeedParams()
            : getChallengeUrl(target);
        const body = url + (text ? "\n\n" + text : "");
        if (
            /android|iphone|ipad|ipod|webos/i.test(navigator.userAgent) &&
            !/firefox/i.test(navigator.userAgent)
        ) {
            try {
                await navigator.share({ text: body });
                return;
            } catch (e) {
                console.warn("navigator.share failed:", e);
            }
        }
        try {
            await navigator.clipboard.writeText(body);
            setHint(copiedHint);
            return;
        } catch (e) {
            console.warn("navigator.clipboard.writeText failed:", e);
        }
        setHint(url);
    }

    const onKey = (key: string) => {
        if (gameState !== GameState.Playing) {
            if (key === "Enter") {
                startNextGame();
            }
            return;
        }
        if (guesses.length === props.maxGuesses) return;
        if (/^[a-z]$/i.test(key)) {
            if (IsLetterAllowed(key))
            {
                setCurrentGuess((guess) =>
                (guess + key.toLowerCase()).slice(0, wordLength)
            );
            tableRef.current?.focus();
            setHint("");
            }
        } else if (key === "Backspace") {
            setCurrentGuess((guess) => guess.slice(0, -1));
            setHint("");
        } else if (key === "Enter") {
            if (currentGuess.length !== wordLength) {
                setHint("Too short");
                return;
            }
            if (!dictionary.includes(currentGuess)) {
                setHint("Not a valid word");
                return;
            }
            for (const g of guesses) {
                const c = clue(g, target);
                const feedback = violation(props.difficulty, c, currentGuess);
                if (feedback) {
                    setHint(feedback);
                    return;
                }
            }
            setGuesses((guesses) => guesses.concat([currentGuess]));
            setCurrentGuess((guess) => "");

            const gameOver = (verbed: string) =>
                `You ${verbed}! The answer was ${target.toUpperCase()}. (Enter to ${challenge ? "play a random game" : "play again"
                })`;

            if (currentGuess === target) {
                setHint(gameOver("won"));
                setGameState(GameState.Won);
            } else if (guesses.length + 1 === props.maxGuesses) {
                setHint(gameOver("lost"));
                setGameState(GameState.Lost);
            } else {
                setHint("");
                speak(describeClue(clue(currentGuess, target)));
            }
        }
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!e.ctrlKey && !e.metaKey) {
                onKey(e.key);
            }
            if (e.key === "Backspace") {
                e.preventDefault();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
        };
    });

    let letterInfo = new Map<string, Clue>();
    const tableRows = Array(props.maxGuesses)
        .fill(undefined)
        .map((_, i) => {
            const guess = [...guesses, currentGuess][i] ?? "";
            const cluedLetters = clue(guess, target);
            const lockedIn = i < guesses.length;
            if (lockedIn) {
                for (const { clue, letter } of cluedLetters) {
                    if (clue === undefined) break;
                    const old = letterInfo.get(letter);
                    if (old === undefined || clue > old) {
                        letterInfo.set(letter, clue);
                    }
                }
            }
            return (
                <Row
                    key={i}
                    wordLength={wordLength}
                    rowState={
                        lockedIn
                            ? RowState.LockedIn
                            : i === guesses.length
                                ? RowState.Editing
                                : RowState.Pending
                    }
                    cluedLetters={cluedLetters}
                />
            );
        });

    return (
        <div className="Game" style={{ display: props.hidden ? "none" : "block" }}>
            <div className="Game-options">
                <label htmlFor="wordLength">Number of letters:</label>
                <input
                    type="range"
                    min={minLength}
                    max={maxLength}
                    id="wordLength"
                    disabled={
                        gameState === GameState.Playing &&
                        (guesses.length > 0 || currentGuess !== "" || challenge !== "")
                    }
                    value={wordLength}
                    onChange={(e) => {
                        const length = Number(e.target.value);
                        resetRng();
                        setGameNumber(1);
                        setGameState(GameState.Playing);
                        setGuesses([]);
                        setCurrentGuess("");
                        setTarget(randomTarget(length));
                        setWordLength(length);
                        setHint(`${length} letters`);
                    }}
                ></input>
                <button
                    style={{ flex: "0 0 auto" }}
                    disabled={gameState !== GameState.Playing || guesses.length === 0}
                    onClick={() => {
                        setHint(
                            `The answer was ${target.toUpperCase()}. (Enter to play again)`
                        );
                        setGameState(GameState.Lost);
                        (document.activeElement as HTMLElement)?.blur();
                    }}
                >
                    Give Up
        </button>
                <div className="Game" style={{ display: props.hidden ? "none" : "block" }}>
                    <div className="Game-options">
                        <label htmlFor="worddifficultyJP">Word Difficulty:</label>
                        <input
                            type="range"
                            min={minDifficultyJP}
                            max={maxDifficultyJP}
                            id="worddifficultyJP"
                            disabled={
                                gameState === GameState.Playing &&
                                (guesses.length > 0 || currentGuess !== "" || challenge !== "")
                            }
                            value={currentDifficultyJP}
                            onChange={(e) => {
                                const difficultyJP = Number(e.target.value);
                                targets = targetList.slice(0, AvailableTargets[difficultyJP - 1]);
                                currentDifficultyJP = difficultyJP;
                                resetRng();
                                setGameNumber(1);
                                setGameState(GameState.Playing);
                                setGuesses([]);
                                setCurrentGuess("");
                                setTarget(randomTarget(wordLength));
                                setWorddifficultyJP(difficultyJP);
                               // setHint(`${difficultyJP} word list`);
                            }}
                        ></input>
                    </div>
                </div>
            </div>
            <table
                className="Game-rows"
                tabIndex={0}
                aria-label="Table of guesses"
                ref={tableRef}
            >
                <tbody>{tableRows}</tbody>
            </table>
            <p
                role="alert"
                style={{
                    userSelect: /https?:/.test(hint) ? "text" : "none",
                    whiteSpace: "pre-wrap",
                }}
            >
                {hint || `\u00a0`}
            </p>
            <Keyboard
                layout={props.keyboardLayout}
                letterInfo={letterInfo}
                onKey={onKey}
            />
            <div className="Game-seed-info">
                {challenge
                    ? "playing a challenge game"
                    : seed
                        ? `${describeSeed(seed)} — length ${wordLength}, game ${gameNumber}`
                        : "playing a random game"}
            </div>
            <p>
                <button
                    onClick={() => {
                        share("Link copied to clipboard!");
                    }}
                >
                    Share a link to this game
        </button>{" "}
                {gameState !== GameState.Playing && (
                    <button
                        onClick={() => {
                            const emoji = props.colorBlind
                                ? ["⬛", "🟦", "🟧"]
                                : ["⬛", "🟨", "🟩"];
                            share(
                                "Result copied to clipboard!",
                                guesses
                                    .map((guess) =>
                                        clue(guess, target)
                                            .map((c) => emoji[c.clue ?? 0])
                                            .join("")
                                    )
                                    .join("\n")
                            );
                        }}
                    >
                        Share emoji results
                    </button>
                )}
            </p>
        </div>
    );
}

export default Game;
