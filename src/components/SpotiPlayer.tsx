import React, {useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import SpotifyWebApi from 'spotify-web-api-js';
import playPause from '../assets/playpause.svg';
import backIcon from '../assets/back.svg';
import nextIcon from '../assets/next.svg';
import blacksquare from '../assets/square.png';
import Play from '../assets/Play.svg';
import Pause from '../assets/Pause.svg';
import Battery from '../assets/battery.svg';
import Batterylow from '../assets/batterylow.svg';
import {Slider} from '@base-ui-components/react/slider';
import styles from '../index.module.css';

const spotifyApi = new SpotifyWebApi();

const CLIENT_ID = 'cff99ec39a2c4666bfaeaf792e4aaa7b';
const REDIRECT_URI = 'https://ipod.2004.lol/';
// const REDIRECT_URI = 'http://192.168.15.14:1212/';


const SCOPES = [
    'playlist-read-private',
    'playlist-read-collaborative',
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
].join(' ');

// PKCE helper functions
function generateRandomString(length: number): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
}

function base64encode(input: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    const hashed = await sha256(codeVerifier);
    return base64encode(hashed);
}

async function redirectToSpotifyAuth(): Promise<void> {
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    localStorage.setItem('code_verifier', codeVerifier);

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code: string): Promise<string | null> {
    const codeVerifier = localStorage.getItem('code_verifier');
    if (!codeVerifier) {
        console.error('No code verifier found');
        return null;
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier,
        }),
    });

    if (!response.ok) {
        console.error('Token exchange failed:', await response.text());
        return null;
    }

    const data = await response.json();
    localStorage.removeItem('code_verifier');

    // Store refresh token for later use
    if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
    }

    return data.access_token;
}

async function refreshAccessToken(): Promise<string | null> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
        return null;
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
        console.error('Token refresh failed');
        return null;
    }

    const data = await response.json();

    // Update refresh token if a new one is provided
    if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
    }

    return data.access_token;
}

const SpotiPlayer: React.FC = () => {
    const [token, setToken] = useState<string | null>(null);
    const [player, setPlayer] = useState<Spotify.Player | null>(null);
    const [deviceId, setDeviceId] = useState<string>('');
    const [track, setTrack] = useState<Spotify.Track | null>(null);
    const [playlists, setPlaylists] = useState<
        SpotifyApi.PlaylistObjectSimplified[]
    >([]);
    const [selectedPlaylist, setSelectedPlaylist] =
        useState<SpotifyApi.PlaylistObjectSimplified | null>(null);
    const [playlistTracks, setPlaylistTracks] = useState<
        SpotifyApi.PlaylistTrackObject[]
    >([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const navigate = useNavigate();
    const [isPlaying, setIsplaying] = useState(false);

    const wheelRef = useRef<HTMLDivElement | null>(null);
    const pointerIdRef = useRef<number | null>(null);
    const lastAngleRef = useRef<number | null>(null);
    const trackRef = useRef<{ [key: number]: HTMLDivElement | null }>({});
    const playlistRef = useRef<{ [key: number]: HTMLDivElement | null }>({});

    const [focusArea, setFocusArea] = useState('playlists');
    const [highlightedPlaylistIndex, setHighlightedPlaylistIndex] = useState(0);
    const [highlightedTrackIndex, setHighlightedTrackIndex] = useState(0);
    const [songDuration, setSongDuration] = useState(0);
    const [songPosition, setSongPosition] = useState<number>(0);
    const [isDragging, setIsDragging] = useState(false);
    const [nowPlayingIndex, SetNowPlayingIndex] = useState(1);
    const [batteryStatus, setBatteryStatus] = useState(Battery)

    let now = new Date()
    let hours: string | number = now.getHours()
    let minutes: string | number = now.getMinutes()

    minutes = minutes < 10 ? '0' + minutes : minutes;
    hours = hours < 10 ? '0' + hours : hours;

    const enum Screen {
        List = 1,
        Playlist = 0,
        NowPlaying = 2,
    }

    const [screen, setScreen] = useState(Screen.Playlist);

    const handleSeek = (number: number) => {
        setSongPosition(Number(number));
    };

    const handleHoldForward = () => {
        spotifyApi.seek(songPosition + 10000)
    }


    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    const handleTokenExpiration = async () => {
        localStorage.removeItem('token');
        setToken(null);

        // Try to refresh the token first
        const newToken = await refreshAccessToken();
        if (newToken) {
            setToken(newToken);
            localStorage.setItem('token', newToken);
        } else {
            // If refresh fails, redirect to auth
            localStorage.removeItem('refresh_token');
            redirectToSpotifyAuth();
        }
    };


    useEffect(() => {
        const initAuth = async () => {
            // Check for errors in URL (e.g., from failed OAuth)
            const urlParams = new URLSearchParams(window.location.search);
            const error = urlParams.get('error');
            if (error) {
                console.error('OAuth error:', error);
                // Clear URL and try again
                window.history.replaceState({}, document.title, window.location.pathname);
                localStorage.removeItem('token');
                localStorage.removeItem('refresh_token');
                localStorage.removeItem('code_verifier');
                redirectToSpotifyAuth();
                return;
            }

            // Check for authorization code (PKCE flow callback)
            const code = urlParams.get('code');
            if (code) {
                const accessToken = await exchangeCodeForToken(code);
                if (accessToken) {
                    setToken(accessToken);
                    localStorage.setItem('token', accessToken);
                    window.history.replaceState({}, document.title, window.location.pathname);
                } else {
                    console.error('Failed to exchange code for token');
                    redirectToSpotifyAuth();
                }
                return;
            }

            // Check for stored token
            const storedToken = localStorage.getItem('token');
            if (storedToken) {
                setToken(storedToken);
                return;
            }

            // Check for hash-based token (legacy implicit flow - for backwards compatibility)
            const hash = window.location.hash.substring(1);
            if (hash) {
                const hashParams = new URLSearchParams(hash);
                const hashError = hashParams.get('error');
                if (hashError) {
                    console.error('OAuth hash error:', hashError);
                    window.history.replaceState({}, document.title, window.location.pathname);
                    localStorage.removeItem('token');
                    localStorage.removeItem('code_verifier');
                }
                const accessToken = hashParams.get('access_token');
                if (accessToken) {
                    setToken(accessToken);
                    localStorage.setItem('token', accessToken);
                    window.history.replaceState({}, document.title, window.location.pathname);
                    return;
                }
            }

            // No token found, start PKCE auth flow
            redirectToSpotifyAuth();
        };

        initAuth();
    }, []);



    useEffect(() => {
        const interval = setInterval(() => {
            if (player && isLoaded && !isDragging) {
                player.getCurrentState().then((state: any) => {
                    if (!state) return;
                    setSongPosition(state.position);
                    setSongDuration(state.duration);
                });
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [player, isLoaded, isDragging]);

    useEffect(() => {
        if (!token) {
            return;
        }

        spotifyApi.setAccessToken(token);

        const fetchPlaylists = () => {
            spotifyApi.getUserPlaylists().then(
                function (data) {
                    setPlaylists(data.items || []);
                    setHighlightedPlaylistIndex(0);
                    console.log(data);
                },
                function (err) {
                    console.error(err);
                    handleTokenExpiration()
                },
            );
        };
        fetchPlaylists();
        const initPlayer = () => {
            console.log('Initializing Spotify Player');
            // @ts-ignore
            const spotifyPlayer = new window.Spotify.Player({
                name: 'ipod classic',
                getOAuthToken: (cb: (token: string) => void) => {
                    cb(token);
                },
                volume: 0.5,
            });

            spotifyPlayer.addListener(
                'ready',
                ({device_id}: { device_id: string }) => {
                    console.log('Player ready with Device ID', device_id);
                    setDeviceId(device_id);
                    setPlayer(spotifyPlayer);
                },
            );

            spotifyPlayer.addListener(
                'player_state_changed',
                (state: Spotify.PlaybackState | null) => {
                    if (state) {
                        setTrack(state.track_window.current_track);
                        setSongDuration(state.duration);
                        setSongPosition(state.position);
                    }
                },
            );

            spotifyPlayer.addListener('initialization_error', ({message}: any) => {
                console.error('Initialization error:', message);
            });

            spotifyPlayer.addListener('authentication_error', ({message}: any) => {
                console.error('Authentication error:', message);
                navigate('/', {replace: true});
            });

            spotifyPlayer.connect().then((success: boolean) => {
                if (success) {
                    console.log('Successfully connected to Spotify Player');
                    setIsLoaded(true);
                } else {
                    console.error('Failed to connect to Spotify Player');
                }
            });
        };

        if ((window as any).Spotify) {
            console.log('Spotify SDK is loaded');
            initPlayer();
        } else {
            console.log('Spotify SDK not loaded, waiting for spotify-sdk-ready');
            window.addEventListener('spotify-sdk-ready', initPlayer);
        }

        return () => {
            window.removeEventListener('spotify-sdk-ready', initPlayer);
            if (player) {
                player.disconnect();
            }
        };
    }, [navigate, token]);

    useEffect(() => {
        if (playlists.length === 0) {
            setHighlightedPlaylistIndex(0);
        } else {
            setHighlightedPlaylistIndex((i) =>
                Math.max(0, Math.min(i, playlists.length - 1)),
            );
        }
    }, [playlists]);

    useEffect(() => {
        if (playlistTracks.length === 0) {
            setHighlightedTrackIndex(0);
        } else {
            setHighlightedTrackIndex((i) =>
                Math.max(0, Math.min(i, playlistTracks.length - 1)),
            );
        }
    }, [playlistTracks]);

    useEffect(() => {
        if (trackRef.current[highlightedTrackIndex]) {
            trackRef.current[highlightedTrackIndex].scrollIntoView({
                block: 'nearest',
            });
        }
    }, [highlightedTrackIndex]);

    useEffect(() => {
        if (playlistRef.current[highlightedPlaylistIndex]) {
            playlistRef.current[highlightedPlaylistIndex].scrollIntoView({
                block: 'nearest',
            });
        }
    }, [highlightedPlaylistIndex]);

    const fetchPlaylistTracks = async (playlistId: string) => {
        try {
            const response = await spotifyApi.getPlaylistTracks(playlistId, {
                limit: 100,
            });
            setPlaylistTracks(response.items || []);
            setHighlightedTrackIndex(0);
            console.log('Playlist tracks fetched:', response.items);
        } catch (error: any) {
            console.error('Error fetching playlist tracks:', error);
            if (error?.status === 401) {
                console.error('Unauthorized: Token may be expired or invalid');
                navigate('/', {replace: true});
            }
        }
    };

    const playTrack = async (trackUri?: string, index = 0) => {
        if (!deviceId) {
            console.error('No device ID available');
            return;
        }
        if (!token) {
            console.error('No token available');
            navigate('/', {replace: true});
            return;
        }
        if (isLoaded) {
            try {
                await spotifyApi.play({
                    device_id: deviceId,
                    context_uri: selectedPlaylist?.uri,
                    offset: {position: index},
                });
                console.log('Track played');
            } catch (error: any) {
                console.error('Error playing track:', error);
                if (error?.status === 401) {
                    console.error('Unauthorized: Token may be expired or invalid');
                    navigate('/', {replace: true});
                }
            }
        }
    };

    const handleMenuButton = () => {
        if (screen === Screen.List) {
            setScreen(Screen.Playlist);
            setFocusArea('playlists');
        } else if (screen === Screen.Playlist) {
        } else if (screen === Screen.NowPlaying) {
            setScreen(Screen.List);
            setFocusArea('tracks');
        }
    };

    const handlePlaylistSelect = (
        playlist: SpotifyApi.PlaylistObjectSimplified,
    ) => {
        setSelectedPlaylist(playlist);
        fetchPlaylistTracks(playlist.id);
        setFocusArea('tracks');
    };

    const handleTrackSelect = (trackUri: string, index: number) => {
        playTrack(trackUri, index);
        setIsplaying(true);
        setScreen(Screen.NowPlaying);
        SetNowPlayingIndex(index + 1);
    };

    const handlePlay = () => {
        setIsplaying(true);
        spotifyApi.play();
    };

    const handlePause = () => {
        setIsplaying(false);
        spotifyApi.pause();
    };
    const handleNext = () => {
        spotifyApi.skipToNext();
        SetNowPlayingIndex(nowPlayingIndex + 1);

    };

    const handlePrev = () => {
        spotifyApi.skipToPrevious();
        if (nowPlayingIndex > 1) {
            SetNowPlayingIndex(nowPlayingIndex - 1);
        }
    };

    // scroll wheel
    function getAngle(cx: number, cy: number, x: number, y: number) {
        return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
    }

    function moveSelection(direction: number) {
        if (focusArea === 'playlists') {
            setHighlightedPlaylistIndex((cur) => {
                const next = cur + direction;
                return Math.max(0, Math.min(next, playlists.length - 1));
            });
        } else {
            setHighlightedTrackIndex((cur) => {
                const next = cur + direction;
                return Math.max(0, Math.min(next, playlistTracks.length - 1));
            });
        }
    }

    useEffect(() => {
        const el = wheelRef.current;
        if (!el) return;

        const onPointerDown = (ev: PointerEvent) => {
            pointerIdRef.current = ev.pointerId;
            (ev.target as Element).setPointerCapture(ev.pointerId);
            const rect = el.getBoundingClientRect();
            lastAngleRef.current = getAngle(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
                ev.clientX,
                ev.clientY,
            );
        };

        const onPointerMove = (ev: PointerEvent) => {
            if (pointerIdRef.current !== ev.pointerId || lastAngleRef.current == null)
                return;
            const rect = el.getBoundingClientRect();
            const angle = getAngle(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
                ev.clientX,
                ev.clientY,
            );
            const delta = angle - lastAngleRef.current;

            if (delta > 20) {
                moveSelection(-1);
                lastAngleRef.current = angle;
            } else if (delta < -20) {
                moveSelection(1);
                lastAngleRef.current = angle;
            }

            // ev.preventDefault();
        };

        const onPointerUp = (ev: PointerEvent) => {
            if (pointerIdRef.current !== ev.pointerId) return;
            (ev.target as Element).releasePointerCapture(ev.pointerId);
            pointerIdRef.current = null;
            lastAngleRef.current = null;
            // ev.preventDefault();
        };

        el.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);

        return () => {
            el.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };
    }, [focusArea, playlists, playlistTracks, moveSelection]);

    const centerPressAction = () => {
        if (focusArea === 'playlists') {
            const playlist = playlists[highlightedPlaylistIndex];
            setScreen(Screen.List);
            if (playlist) handlePlaylistSelect(playlist);
        } else if (focusArea === 'tracks' && screen !== Screen.NowPlaying) {
            const item = playlistTracks[highlightedTrackIndex];
            if (item?.track) {
                handleTrackSelect(item.track.uri, highlightedTrackIndex);
            }
        }
        if (screen === Screen.NowPlaying) {
            setScreen(Screen.List);
        }
    };

    const onPlaylistClick = (
        index: number,
        playlist: SpotifyApi.PlaylistObjectSimplified,
    ) => {
        setHighlightedPlaylistIndex(index);
        handlePlaylistSelect(playlist);
        setScreen(Screen.List);
    };

    const onTrackClick = (
        index: number,
        item: SpotifyApi.PlaylistTrackObject,
    ) => {
        setHighlightedTrackIndex(index);
        if (item.track) handleTrackSelect(item.track.uri, index);
    };

    return (
        <div className="player root">
            {/*<Slider.Root defaultValue={50}*/}
            {/*             value={50}*/}
            {/*             max={100}*/}
            {/*             onValueCommitted={(value) => {*/}
            {/*                 spotifyApi.seek(value)*/}
            {/*                 setIsDragging(false)*/}
            {/*             }}*/}
            {/*             onValueChange={(value) => {*/}
            {/*                 handleSeek(value)*/}
            {/*                 setIsDragging(true)*/}
            {/*             }}>*/}
            {/*    <Slider.Control className={styles.Control}>*/}
            {/*        <Slider.Track className={styles.Track}>*/}
            {/*            <Slider.Indicator className={styles.Indicator}/>*/}
            {/*            /!*<Slider.Thumb className={styles.Thumb}/>*!/*/}
            {/*        </Slider.Track>*/}
            {/*    </Slider.Control>*/}
            {/*</Slider.Root>*/}
            {/*<div className="scrubber">*/}
            {/*    <div className="scrubberprogress"*/}
            {/*         style={{width: `${(songPosition / songDuration) * 100}%`}}*/}
            {/*        // onMouseDown={handleMouseDown}*/}
            {/*        // onMouseUp={handleMouseUp}*/}
            {/*    ></div>*/}
            {/*</div>*/}
            <div className="Screen">
                <div className="statusbar ">
                    <p className="leftinfo">{hours}:{minutes}</p>
                    <div className="rightinfo">
                        <img src={isPlaying ? Play : Pause} height="15px" alt="play /pause"
                             onClick={isPlaying ? handlePause : handlePlay}/>
                        <img src={batteryStatus} height="15px" alt="battery" onClick={() => {
                            if (batteryStatus === Battery) {
                                setBatteryStatus(Batterylow)
                            } else {
                                setBatteryStatus(Battery)
                            }
                        }}/>
                    </div>
                </div>
                <div className="screencontainer"
                     style={{
                         transform: `translateX(-${screen * 100}%)`,
                         transition: 'transform 0.3s ease-in-out',
                     }}>

                    <>
                        <div className="screen screen-playlist">


                            <div className="playlistall">
                                {playlists.length > 0 ? (
                                    playlists.map((playlist, index: number) => (
                                        <div
                                            className={`playlistname ${focusArea === 'playlists' && highlightedPlaylistIndex === index ? 'highlighted' : ''}`}
                                            key={playlist.id}
                                            onClick={() => onPlaylistClick(index, playlist)}
                                            ref={(element) => {
                                                playlistRef.current[index] = element;
                                            }}
                                        >
                                            <img
                                                src={playlist.images?.[0]?.url ?? blacksquare}
                                                height="30px"
                                                alt="playlist cover"
                                                className="playlistimg"
                                            />
                                            <p>{playlist.name}</p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="loading">Loading...</p>
                                )}
                            </div>
                        </div>
                    </>


                    <>
                        <div className="screen screen-list">
                            {/*<div className="statusbar ">*/}
                            {/*    <p className="leftinfo">{hours}:{minutes}</p>*/}
                            {/*    <div className="rightinfo">*/}
                            {/*        <img src={isPlaying ? Play : Pause} height="15px" alt="play /pause"/>*/}
                            {/*        <img src={Battery} height="15px" alt="battery"/>*/}
                            {/*    </div>*/}
                            {/*</div>*/}

                            {selectedPlaylist && (
                                <div className="playlist">
                                    <div className="playlistsongslist">
                                        {playlistTracks.length > 0 ? (
                                            playlistTracks.map((item, index: number) => {
                                                const track = item.track;

                                                if (!track || track.type !== "track") return null;

                                                return (
                                                    <div
                                                        className={`playlistsong ${
                                                            focusArea === "tracks" && highlightedTrackIndex === index
                                                                ? "highlighted"
                                                                : ""
                                                        }`}
                                                        key={track.id}
                                                        onClick={() => onTrackClick(index, item)}
                                                        ref={(el) => {
                                                            trackRef.current[index] = el;
                                                        }}
                                                    >
                                                        <img
                                                            src={track.album.images?.[0]?.url ?? blacksquare}
                                                            height="30px"
                                                            alt="album cover"
                                                            className="trackimg"
                                                        />
                                                        <div style={{marginLeft: "5px"}}>
                                                            {track.name} – {track.artists?.[0]?.name}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <p className="loading">Loading...</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                    </>


                    <div className="screen screen-nowplaying">
                        {/*<div className="statusbar ">*/}
                        {/*    <p className="leftinfo">{hours}:{minutes}</p>*/}
                        {/*    <div className="rightinfo">*/}
                        {/*        <img src={isPlaying ? Play : Pause} height="15px" alt="play /pause"/>*/}
                        {/*        <img src={Battery} height="15px" alt="battery"/>*/}
                        {/*    </div>*/}
                        {/*</div>*/}
                        <div className="nowplayingscreen">
                            <img
                                src={track ? track.album.images?.[0]?.url : blacksquare}
                                height="150px"
                                className="nowplayingimg"
                                alt="now playing track image"
                            />
                            <div className="nowplayingdata">
                                <h1>{track ? track.name : ''}</h1>
                                <p>{track ? track.artists?.[0]?.name : ''}</p>
                                <p>
                                    {track?.album.name}
                                </p>
                                <p className="tracksleft">
                                    {nowPlayingIndex} of {playlistTracks.length}
                                </p>
                            </div>
                        </div>


                        <div className="seekerdiv">


                            <p className="songposition"> {formatTime(songPosition)} </p>
                            {/*<input*/}
                            {/*    type="range"*/}
                            {/*    className="seeker"*/}
                            {/*    value={songPosition}*/}
                            {/*    max={songDuration}*/}
                            {/*    onChange={(e) => {*/}
                            {/*        handleSeek(e.target.value);*/}
                            {/*    }}*/}
                            {/*    onMouseUp={() => {*/}
                            {/*        spotifyApi.seek(songPosition);*/}
                            {/*        setIsDragging(false);*/}
                            {/*    }}*/}
                            {/*    onMouseDown={() => {*/}
                            {/*        setIsDragging(true);*/}
                            {/*    }}*/}
                            {/*    onTouchStart={() => {*/}
                            {/*        spotifyApi.seek(songPosition);*/}
                            {/*        setIsDragging(false);*/}
                            {/*    }}*/}
                            {/*    onTouchEnd={() => {*/}
                            {/*        setIsDragging(true);*/}
                            {/*    }}*/}
                            {/*/>{' '}*/}
                            <Slider.Root defaultValue={0}
                                         value={songPosition}
                                         max={songDuration}
                                         onValueCommitted={(value) => {
                                             spotifyApi.seek(value)
                                             setIsDragging(false)
                                         }}
                                         onValueChange={(value) => {
                                             handleSeek(value)
                                             setIsDragging(true)
                                         }}>
                                <Slider.Control className={styles.Control}>
                                    <Slider.Track className={styles.Track}>
                                        <Slider.Indicator className={styles.Indicator}/>
                                        {/*<Slider.Thumb className={styles.Thumb}/>*/}
                                    </Slider.Track>
                                </Slider.Control>
                            </Slider.Root>


                            <p className="songposition">{formatTime(songDuration)}</p>
                        </div>
                    </div>
                    <>

                    </>
                </div>
            </div>


            <div
                className="Scrollwheel"
                ref={wheelRef}
                role="region"
                aria-label="scroll wheel"
            >
                <button
                    className="top"
                    type="button"
                    onClick={() => {
                        handleMenuButton();
                    }}
                >
                    MENU
                </button>
                <button
                    className="bottom"
                    type="button"
                    onClick={isPlaying ? handlePause : handlePlay}
                >
                    <img src={playPause} alt="play/pause"/>
                </button>
                <button
                    className="center"
                    onClick={() => centerPressAction()}
                    type="button"
                    aria-label="center button"
                />
                <button className="left" type="button" onClick={() => handlePrev()}>
                    <img src={backIcon} alt="prev song"/>
                </button>
                <button className="right" type="button"
                        onClick={() => handleNext()}
                >
                    <img src={nextIcon} alt="next song"/>
                </button>

                <div className="ScrollwheelBg"/>
            </div>
        </div>


    );
};

export default SpotiPlayer;
