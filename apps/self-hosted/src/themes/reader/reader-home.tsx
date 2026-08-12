import { InstanceConfigManager, t } from '@/core';
import {
  useCommunityData,
  useInstanceConfig,
} from '@/features/blog/hooks/use-instance-config';

interface Props {
  filter?: string;
  limit?: number;
}

/**
 * What the Reader theme renders where the feed route mounts the ArchiveList
 * seam: the rail already IS the archive, so the reading pane greets instead
 * of repeating it. Only ever seen at the desktop split; on small screens the
 * shell gives the feed route to the rail and hides this pane entirely. The
 * props are the seam's contract and deliberately unused.
 */
export function ReaderHome(_props: Props) {
  const { username, isCommunityMode } = useInstanceConfig();
  const { data: community } = useCommunityData();

  const blogTitle = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.meta.title,
  );
  const blogDescription = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.meta.description,
  );

  const displayTitle =
    isCommunityMode && community?.title ? community.title : blogTitle || username;

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md text-center">
        <h2 className="heading-theme text-2xl mb-3">{displayTitle}</h2>
        {blogDescription && (
          <p className="text-theme-secondary mb-6">{blogDescription}</p>
        )}
        <p className="text-sm text-theme-muted font-theme-ui">
          {t('reader_home_hint')}
        </p>
        <p className="text-sm text-theme-muted font-theme-ui mt-1">
          {t('reader_home_keys')}
        </p>
      </div>
    </div>
  );
}
