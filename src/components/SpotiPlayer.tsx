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

const CLIENT_ID = '883f91d3b0a841e687796d625f391f44';
const REDIRECT_URI = 'https://ipod.2004.lol/';
// const REDIRECT_URI = 'http://localhost:1212/';
// const REDIRECT_URI = 'http://192.168.1.53:1212/';


const SCOPES = [
    'playlist-read-private',
    'playlist-read-collaborative',
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
].join(' ');

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

    const handleTokenExpiration = () => {
        localStorage.removeItem('token');
        setToken(null);
        window.location.href = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}&show_dialog=true`;
    };


    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
            setToken(storedToken);
        } else {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');
            if (accessToken) {
                setToken(accessToken);
                localStorage.setItem('token', accessToken);
                window.history.replaceState(
                    {},
                    document.title,
                    window.location.pathname + window.location.search
                );
            } else {
                window.location.href = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}&show_dialog=true`;
            }
        }
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
