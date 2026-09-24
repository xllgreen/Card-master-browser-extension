import { CardMetadataCopy } from '../../components/CardMetadataCopy';
import { CardLockEffect, useCardLockPhase } from './CardLockEffect';
import { CardMaterialLayers } from './CardMaterialLayers';
import { CardStateBadge, type CardStateTone } from './CardStateBadge';

// 卡面只作静态图片展示，界面不再播放视频。
export type ManagerCardMedia = {
  kind: 'image';
  imageUrl: string;
};

type ManagerCardFaceProps = {
  active: boolean;
  enabled: boolean;
  playing: boolean;
  forge: boolean;
  showForgeMark?: boolean;
  modifiers?: readonly string[];
  media: ManagerCardMedia;
  edgeUrl: string;
  stateLabel: string | null;
  stateTone: CardStateTone;
  title: string;
  description: string;
} & (
  | {
      finish: 'framed';
    }
  | {
      finish: 'holographic';
      sparklesUrl: string;
      showSparkles?: boolean;
    }
);

export function ManagerCardFace(props: ManagerCardFaceProps) {
  const {
    active,
    enabled,
    playing,
    forge,
    showForgeMark = true,
    modifiers = [],
    media,
    edgeUrl,
    stateLabel,
    stateTone,
    title,
    description,
  } = props;
  const { phase: lockPhase, completeTransition: completeLockTransition } =
    useCardLockPhase(enabled);

  const modifierClassName =
    modifiers.length > 0 ? ` ${modifiers.join(' ')}` : '';

  return (
    <div
      className={`manager-card__face${active ? ' is-active' : ''}${enabled ? ' is-enabled' : ' is-sleeping'}${forge ? ' is-forge' : ''}${modifierClassName}`}
    >
      <img
        className="manager-card__cover"
        src={media.imageUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {props.finish === 'framed' ? (
        <CardMaterialLayers edgeUrl={edgeUrl} finish="framed" />
      ) : (
        <CardMaterialLayers
          edgeUrl={edgeUrl}
          finish="holographic"
          sparklesUrl={props.sparklesUrl}
          showSparkles={props.showSparkles ?? false}
        />
      )}
      {stateLabel && <CardStateBadge label={stateLabel} tone={stateTone} />}
      {forge && showForgeMark && (
        <div className="manager-card__forge-mark">
          <i />
          <i />
          <i />
        </div>
      )}
      <CardLockEffect
        phase={lockPhase}
        active={playing}
        onTransitionComplete={completeLockTransition}
      />
      <CardMetadataCopy
        className="manager-card__identity"
        name={title}
        description={description}
      />
    </div>
  );
}
