import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { ModelSample, PoseFrames, PoseJoint } from '../lib/model-result';

const jointNames: PoseJoint[] = ['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'];

const bones: [PoseJoint, PoseJoint][] = [
  ['nose', 'left_eye'], ['nose', 'right_eye'], ['left_eye', 'left_ear'], ['right_eye', 'right_ear'],
  ['left_shoulder', 'right_shoulder'], ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'], ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'], ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
];

export default function PoseOverlay({ sample, frames, video }: { sample?: ModelSample; frames?: PoseFrames | null; video?: RefObject<HTMLVideoElement | null> }) {
  const [frameIndex, setFrameIndex] = useState(0);
  useEffect(() => {
    const player = video?.current;
    if (!frames || !player) return;
    let handle = 0;
    let animation = 0;
    const update = (seconds: number) => setFrameIndex(Math.floor(seconds * frames.fps + 1e-4));
    const seek = () => update(player.currentTime);
    seek();
    if (typeof player.requestVideoFrameCallback === 'function') {
      const next = (_now: number, metadata: VideoFrameCallbackMetadata) => { update(metadata.mediaTime); handle = player.requestVideoFrameCallback(next); };
      handle = player.requestVideoFrameCallback(next);
    } else {
      const next = () => { seek(); animation = requestAnimationFrame(next); };
      animation = requestAnimationFrame(next);
    }
    player.addEventListener('seeked', seek);
    player.addEventListener('loadeddata', seek);
    return () => { player.cancelVideoFrameCallback?.(handle); cancelAnimationFrame(animation); player.removeEventListener('seeked', seek); player.removeEventListener('loadeddata', seek); };
  }, [frames, video]);
  const width = frames?.width ?? sample?.frame_width_px;
  const height = frames?.height ?? sample?.frame_height_px;
  if ((!frames && (!sample || sample.pose_status !== 'ok')) || !width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) return null;
  const joints = new Map<PoseJoint, { x: number; y: number }>();
  for (const [index, joint] of jointNames.entries()) {
    const point = frames?.frames[frameIndex]?.[index];
    const x = frames ? point?.[0] : sample?.[`${joint}_x_px`], y = frames ? point?.[1] : sample?.[`${joint}_y_px`], confidence = frames ? point?.[2] : sample?.[`${joint}_confidence`];
    if (typeof x === 'number' && typeof y === 'number' && typeof confidence === 'number' && Number.isFinite(x) && Number.isFinite(y) && confidence >= .5 && confidence <= 1 && x >= 0 && x <= width && y >= 0 && y <= height) joints.set(joint, { x, y });
  }
  if (!joints.size) return null;
  const segments = bones.flatMap(([a, b]) => {
    const start = joints.get(a), end = joints.get(b);
    return start && end ? [`M${start.x},${start.y} L${end.x},${end.y}`] : [];
  }).join(' ');
  return <svg className="pose-overlay" data-frame={frames ? frameIndex : undefined} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Model posture skeleton">
    <path d={segments} fill="none" stroke="#08131c" strokeWidth="6" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    <path d={segments} fill="none" stroke="#67e8f9" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    {[...joints].map(([joint, point]) => <circle key={joint} cx={point.x} cy={point.y} r={width / 180} fill="#ffffff" stroke="#08131c" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
  </svg>;
}
