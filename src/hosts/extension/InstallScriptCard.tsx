import { type CSSProperties, forwardRef } from 'react';

import { CardMetadataCopy } from '../../components/CardMetadataCopy';
import { UiLoader } from '../../components/ui/Ui';
import { CardMaterialLayers } from '../../features/manager-interaction/CardMaterialLayers';

export type InstallCardAssets = {
  back: string;
  bottomFrame: string;
  edge: string;
  sparkles: string;
  // 卡面只作静态图片展示，安装页同样不再播放视频。
  media: {
    kind: 'image';
    image: string;
  };
};

export const InstallScriptCard = forwardRef<
  HTMLDivElement,
  {
    assets: InstallCardAssets;
    name: string;
    description: string;
    waiting?: boolean;
    status: 'ready' | 'error';
    accent?: string;
  }
>(function InstallScriptCard(
  { assets, name, description, waiting = false, status, accent },
  ref,
) {
  return (
    <div
      className="install-card-stage"
      style={
        accent ? ({ '--manager-accent': accent } as CSSProperties) : undefined
      }
      aria-hidden="true"
    >
      <div ref={ref} className="install-card-motion">
        <div className="install-card-idle">
          <div className="install-card-tilt" data-card-local-tilt>
            <div className="install-card">
              <div className="install-card__front">
                <div className="install-card__surface">
                  <img src={assets.media.image} alt="" />
                  <CardMaterialLayers
                    edgeUrl={assets.edge}
                    finish="holographic"
                    sparklesUrl={assets.sparkles}
                    showSparkles={status !== 'error'}
                  />
                  <CardMetadataCopy
                    className="install-card-identity"
                    name={name}
                    description={description}
                  />
                </div>
                <img
                  className="install-card-bottom"
                  src={assets.bottomFrame}
                  alt=""
                />
              </div>
              <div className="install-card__back">
                <img src={assets.back} alt="" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="install-card-reflection" />
      {waiting && (
        <div className="install-card-wait">
          <UiLoader compact label="正在写入牌库" />
        </div>
      )}
    </div>
  );
});
