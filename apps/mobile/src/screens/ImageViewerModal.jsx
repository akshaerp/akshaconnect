import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import Text from '../theme/AppText';

const MIN_SCALE = 1;
const MAX_SCALE = 5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function touchDistance(touches = []) {
  if (touches.length < 2) return 0;

  const [a, b] = touches;
  const dx =
    Number(a.pageX || 0) -
    Number(b.pageX || 0);
  const dy =
    Number(a.pageY || 0) -
    Number(b.pageY || 0);

  return Math.sqrt(dx * dx + dy * dy);
}

export default function ImageViewerModal({
  visible,
  source = null,
  uri = '',
  fileName = 'Image',
  contentType = 'image/*',
  sizeText = '',
  sender = '',
  sentAt = '',
  index = 0,
  total = 1,
  busyMode = '',
  reactions = [],
  reactionState = [],
  onClose,
  onPrevious,
  onNext,
  onForward,
  onDownload,
  onShare,
  onReact,
}) {
  const [menuOpen, setMenuOpen] =
    useState(false);

  const [detailsOpen, setDetailsOpen] =
    useState(false);

  const [imageLoading, setImageLoading] =
    useState(false);

  const [scale, setScale] =
    useState(1);

  const [translate, setTranslate] =
    useState({
      x: 0,
      y: 0,
    });

  const scaleRef =
    useRef(1);

  const translateRef =
    useRef({
      x: 0,
      y: 0,
    });

  const gestureRef =
    useRef({
      mode: '',
      startTime: 0,
      startDistance: 0,
      startScale: 1,
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0,
      moved: false,
    });

  const lastTapRef =
    useRef(0);

  function applyScale(nextScale) {
    const value =
      clamp(
        Number(nextScale || 1),
        MIN_SCALE,
        MAX_SCALE
      );

    scaleRef.current = value;
    setScale(value);

    if (value === 1) {
      const reset = {
        x: 0,
        y: 0,
      };

      translateRef.current =
        reset;

      setTranslate(reset);
    }
  }

  function resetView() {
    applyScale(1);
  }

  useEffect(() => {
    if (!visible) return;

    setMenuOpen(false);
    setDetailsOpen(false);
    setImageLoading(true);
    resetView();
  }, [
    visible,
    uri,
    source?.uri,
  ]);

  function rebaseSingleTouch(
    touch,
    moved = false
  ) {
    gestureRef.current = {
      mode: 'single',
      startTime: Date.now(),
      startDistance: 0,
      startScale:
        scaleRef.current,
      startX:
        Number(
          touch?.pageX ||
          0
        ),
      startY:
        Number(
          touch?.pageY ||
          0
        ),
      originX:
        translateRef.current.x,
      originY:
        translateRef.current.y,
      moved,
    };
  }

  function beginPinch(
    touches
  ) {
    const distance =
      touchDistance(
        touches
      );

    if (distance <= 0) {
      return;
    }

    gestureRef.current = {
      mode: 'pinch',
      startTime: Date.now(),
      startDistance:
        distance,
      startScale:
        scaleRef.current,
      startX: 0,
      startY: 0,
      originX:
        translateRef.current.x,
      originY:
        translateRef.current.y,
      moved: true,
    };
  }

  function handleTouchStart(
    event
  ) {
    const touches =
      event.nativeEvent.touches ||
      [];

    if (touches.length >= 2) {
      beginPinch(touches);
      return;
    }

    if (touches.length === 1) {
      rebaseSingleTouch(
        touches[0],
        false
      );
    }
  }

  function handleTouchMove(
    event
  ) {
    const touches =
      event.nativeEvent.touches ||
      [];

    if (touches.length >= 2) {
      const distance =
        touchDistance(touches);

      if (distance <= 0) {
        return;
      }

      const gesture =
        gestureRef.current;

      if (
        gesture.mode !== 'pinch' ||
        gesture.startDistance <= 0
      ) {
        beginPinch(touches);
        return;
      }

      applyScale(
        gesture.startScale *
          (
            distance /
            gesture.startDistance
          )
      );

      return;
    }

    if (touches.length !== 1) {
      return;
    }

    const gesture =
      gestureRef.current;

    if (gesture.mode !== 'single') {
      rebaseSingleTouch(
        touches[0],
        true
      );
      return;
    }

    const dx =
      Number(
        touches[0].pageX ||
        0
      ) -
      gesture.startX;

    const dy =
      Number(
        touches[0].pageY ||
        0
      ) -
      gesture.startY;

    if (
      Math.abs(dx) > 4 ||
      Math.abs(dy) > 4
    ) {
      gesture.moved = true;
    }

    if (scaleRef.current > 1) {
      const next = {
        x:
          gesture.originX +
          dx,
        y:
          gesture.originY +
          dy,
      };

      translateRef.current =
        next;

      setTranslate(next);
    }
  }

  function handleTouchEnd(
    event
  ) {
    const touches =
      event.nativeEvent.touches ||
      [];

    if (touches.length >= 2) {
      beginPinch(touches);
      return;
    }

    if (touches.length === 1) {
      rebaseSingleTouch(
        touches[0],
        true
      );
      return;
    }

    const gesture =
      gestureRef.current;

    if (
      gesture.mode === 'single' &&
      !gesture.moved &&
      Date.now() -
        gesture.startTime <
        320
    ) {
      const now =
        Date.now();

      if (
        now -
          lastTapRef.current <
        320
      ) {
        applyScale(
          scaleRef.current > 1
            ? 1
            : 2.5
        );

        lastTapRef.current = 0;
      } else {
        lastTapRef.current =
          now;
      }
    }

    if (scaleRef.current < 1.03) {
      resetView();
    }

    gestureRef.current = {
      mode: '',
      startTime: 0,
      startDistance: 0,
      startScale:
        scaleRef.current,
      startX: 0,
      startY: 0,
      originX:
        translateRef.current.x,
      originY:
        translateRef.current.y,
      moved: false,
    };
  }

  function handleTouchCancel() {
    gestureRef.current = {
      mode: '',
      startTime: 0,
      startDistance: 0,
      startScale:
        scaleRef.current,
      startX: 0,
      startY: 0,
      originX:
        translateRef.current.x,
      originY:
        translateRef.current.y,
      moved: false,
    };
  }

  const imageSource =
    source?.uri
      ? source
      : uri
        ? { uri }
        : undefined;

  if (!visible) {
    return null;
  }

  const currentReactions =
    new Map(
      (reactionState || [])
        .map((item) => [
          item.emoji,
          item,
        ])
    );

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.root}>
        <StatusBar
          translucent
          backgroundColor="#000000"
          barStyle="light-content"
        />

        <SafeAreaView
          style={styles.safe}
          edges={[
            'top',
            'bottom',
          ]}
        >
          <View
            style={
              styles.topBar
            }
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={onClose}
              style={
                styles.iconButton
              }
            >
              <Text
                style={
                  styles.backIcon
                }
              >
                ‹
              </Text>
            </Pressable>

            <View
              style={
                styles.titleArea
              }
            >
              <Text
                style={styles.sender}
                numberOfLines={1}
              >
                {sender || 'Image'}
              </Text>

              <Text
                style={styles.sentAt}
                numberOfLines={1}
              >
                {sentAt ||
                  `${Math.max(
                    1,
                    Number(total) || 1
                  )} ${
                    Math.max(
                      1,
                      Number(total) || 1
                    ) === 1
                      ? 'image'
                      : 'images'
                  }`}
              </Text>
            </View>

            {onForward ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Forward image"
                onPress={onForward}
                style={
                  styles.iconButton
                }
              >
                <Text
                  style={
                    styles.forwardIcon
                  }
                >
                  ➜
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Image options"
              onPress={() => {
                setDetailsOpen(
                  false
                );

                setMenuOpen(
                  (current) =>
                    !current
                );
              }}
              style={
                styles.iconButton
              }
            >
              <Text
                style={
                  styles.menuIcon
                }
              >
                ⋮
              </Text>
            </Pressable>
          </View>

          <Modal
            visible={menuOpen}
            transparent
            animationType="fade"
            onRequestClose={() =>
              setMenuOpen(
                false
              )
            }
            statusBarTranslucent
            navigationBarTranslucent
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close image options"
              onPress={() =>
                setMenuOpen(
                  false
                )
              }
              style={[
                styles.optionsModalRoot,
                styles.optionsModalBackdrop,
              ]}
            >
              <Pressable
                accessibilityRole="menu"
                accessibilityLabel="Image options menu"
                onPressIn={(event) =>
                  event.stopPropagation()
                }
                onPress={(event) =>
                  event.stopPropagation()
                }
                style={
                  styles.optionsModalMenu
                }
              >
                <Pressable
                  disabled={
                    Boolean(
                      busyMode
                    )
                  }
                  onPress={() => {
                    setMenuOpen(
                      false
                    );

                    onDownload?.();
                  }}
                  style={
                    styles.menuItem
                  }
                >
                  <Text
                    style={
                      styles.menuItemText
                    }
                  >
                    {busyMode ===
                    'download'
                      ? 'Downloading…'
                      : 'Download'}
                  </Text>
                </Pressable>

                <Pressable
                  disabled={
                    Boolean(
                      busyMode
                    )
                  }
                  onPress={() => {
                    setMenuOpen(
                      false
                    );

                    onShare?.();
                  }}
                  style={
                    styles.menuItem
                  }
                >
                  <Text
                    style={
                      styles.menuItemText
                    }
                  >
                    {busyMode ===
                    'share'
                      ? 'Sharing…'
                      : 'Share'}
                  </Text>
                </Pressable>

                {onForward ? (
                  <Pressable
                    onPress={() => {
                      setMenuOpen(
                        false
                      );

                      onForward?.();
                    }}
                    style={
                      styles.menuItem
                    }
                  >
                    <Text
                      style={
                        styles.menuItemText
                      }
                    >
                      Forward
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={() => {
                    setMenuOpen(
                      false
                    );

                    setDetailsOpen(
                      true
                    );
                  }}
                  style={
                    styles.menuItem
                  }
                >
                  <Text
                    style={
                      styles.menuItemText
                    }
                  >
                    Details
                  </Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>

          {detailsOpen ? (
            <View
              style={
                styles.details
              }
            >
              <View
                style={
                  styles.detailsHeader
                }
              >
                <Text
                  style={
                    styles.detailsTitle
                  }
                >
                  Image details
                </Text>

                <Pressable
                  accessibilityLabel="Close image details"
                  onPress={() =>
                    setDetailsOpen(
                      false
                    )
                  }
                >
                  <Text
                    style={
                      styles.detailsClose
                    }
                  >
                    ×
                  </Text>
                </Pressable>
              </View>

              <Text
                style={
                  styles.detailLine
                }
              >
                Name: {fileName}
              </Text>

              <Text
                style={
                  styles.detailLine
                }
              >
                Type: {contentType}
              </Text>

              {sizeText ? (
                <Text
                  style={
                    styles.detailLine
                  }
                >
                  Size: {sizeText}
                </Text>
              ) : null}

              {sender ? (
                <Text
                  style={
                    styles.detailLine
                  }
                >
                  From: {sender}
                </Text>
              ) : null}

              {sentAt ? (
                <Text
                  style={
                    styles.detailLine
                  }
                >
                  Sent: {sentAt}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View
            style={styles.stage}
            onTouchStart={
              handleTouchStart
            }
            onTouchMove={
              handleTouchMove
            }
            onTouchEnd={
              handleTouchEnd
            }
            onTouchCancel={
              handleTouchCancel
            }
          >
            <Image
              pointerEvents="none"
              source={imageSource}
              resizeMode="contain"
              onLoadStart={() =>
                setImageLoading(
                  true
                )
              }
              onLoadEnd={() =>
                setImageLoading(
                  false
                )
              }
              onError={() =>
                setImageLoading(
                  false
                )
              }
              style={[
                styles.image,
                {
                  transform: [
                    {
                      translateX:
                        translate.x,
                    },
                    {
                      translateY:
                        translate.y,
                    },
                    {
                      scale,
                    },
                  ],
                },
              ]}
            />

            {imageLoading ? (
              <View
                pointerEvents="none"
                style={
                  styles.loadingOverlay
                }
              >
                <ActivityIndicator
                  size="large"
                  color="#FFFFFF"
                />
              </View>
            ) : null}

            {Number(total) >
              1 &&
            scale === 1 ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous image"
                  disabled={
                    Boolean(
                      busyMode
                    )
                  }
                  onPress={
                    onPrevious
                  }
                  style={[
                    styles.nav,
                    styles.previous,
                  ]}
                >
                  <Text
                    style={
                      styles.navText
                    }
                  >
                    ‹
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next image"
                  disabled={
                    Boolean(
                      busyMode
                    )
                  }
                  onPress={
                    onNext
                  }
                  style={[
                    styles.nav,
                    styles.next,
                  ]}
                >
                  <Text
                    style={
                      styles.navText
                    }
                  >
                    ›
                  </Text>
                </Pressable>
              </>
            ) : null}

            {scale === 1 ? (
              <View
                pointerEvents="none"
                style={
                  styles.zoomHint
                }
              >
                <Text
                  style={
                    styles.zoomHintText
                  }
                >
                  Pinch or double-tap to zoom
                </Text>
              </View>
            ) : null}
          </View>

          {onReact &&
          reactions.length ? (
            <View
              style={
                styles.reactionBar
              }
            >
              {reactions.map(
                (emoji) => {
                  const current =
                    currentReactions
                      .get(emoji);

                  return (
                    <Pressable
                      key={emoji}
                      accessibilityRole="button"
                      accessibilityLabel={`React ${emoji}`}
                      onPress={() =>
                        onReact(
                          emoji
                        )
                      }
                      style={[
                        styles.reactionButton,
                        current
                          ?.reacted_by_me
                          ? styles.reactionSelected
                          : null,
                      ]}
                    >
                      <Text
                        style={
                          styles.reactionEmoji
                        }
                      >
                        {emoji}
                      </Text>
                    </Pressable>
                  );
                }
              )}
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles =
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor:
        '#000000',
    },

    safe: {
      flex: 1,
      backgroundColor:
        '#000000',
    },

    topBar: {
      minHeight: 64,
      paddingHorizontal: 6,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor:
        'rgba(0,0,0,0.82)',
      zIndex: 10,
    },

    iconButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    backIcon: {
      color: '#FFFFFF',
      fontSize: 38,
      lineHeight: 40,
    },

    forwardIcon: {
      color: '#FFFFFF',
      fontSize: 24,
      fontWeight: '800',
    },

    menuIcon: {
      color: '#FFFFFF',
      fontSize: 30,
      lineHeight: 34,
      fontWeight: '700',
    },

    titleArea: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: 6,
    },

    sender: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
    },

    sentAt: {
      marginTop: 2,
      color: '#D0D5DD',
      fontSize: 11,
    },

    stage: {
      flex: 1,
      position: 'relative',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        '#000000',
    },

    image: {
      width: '100%',
      height: '100%',
    },

    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor:
        'rgba(0,0,0,0.18)',
    },

    nav: {
      position: 'absolute',
      top: '46%',
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        'rgba(0,0,0,0.5)',
    },

    previous: {
      left: 8,
    },

    next: {
      right: 8,
    },

    navText: {
      color: '#FFFFFF',
      fontSize: 34,
      lineHeight: 36,
    },

    zoomHint: {
      position: 'absolute',
      bottom: 18,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 14,
      backgroundColor:
        'rgba(0,0,0,0.48)',
    },

    zoomHintText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
    },

    reactionBar: {
      minHeight: 58,
      paddingHorizontal: 10,
      paddingVertical: 7,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-around',
      backgroundColor:
        'rgba(15,23,42,0.96)',
      borderTopWidth:
        StyleSheet.hairlineWidth,
      borderTopColor:
        '#344054',
    },

    reactionButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    reactionSelected: {
      backgroundColor:
        '#344054',
    },

    reactionEmoji: {
      fontSize: 23,
    },

    optionsModalRoot: {
      flex: 1,
      backgroundColor:
        'transparent',
    },

    optionsModalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor:
        'rgba(0,0,0,0.01)',
    },

    optionsModalMenu: {
      position: 'absolute',
      top: 72,
      right: 10,
      width: 190,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor:
        '#FFFFFF',
      elevation: 24,
    },

    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 100,
      elevation: 100,
      backgroundColor:
        'transparent',
    },

    menu: {
      position: 'absolute',
      zIndex: 110,
      top: 58,
      right: 10,
      width: 190,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor:
        '#FFFFFF',
      elevation: 110,
    },

    menuItem: {
      minHeight: 46,
      paddingHorizontal: 16,
      justifyContent:
        'center',
    },

    menuItemText: {
      color: '#0E2455',
      fontSize: 14,
      fontWeight: '800',
    },

    details: {
      position: 'absolute',
      zIndex: 110,
      elevation: 110,
      top: 72,
      left: 16,
      right: 16,
      padding: 16,
      borderRadius: 14,
      backgroundColor:
        'rgba(17,24,39,0.97)',
    },

    detailsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },

    detailsTitle: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
    },

    detailsClose: {
      color: '#FFFFFF',
      fontSize: 26,
    },

    detailLine: {
      marginTop: 5,
      color: '#E5E7EB',
      fontSize: 12,
    },
  });
