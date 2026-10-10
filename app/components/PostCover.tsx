import './post-cover.css';

type CoverProps = {
  title: string;
  cover: string;
  coverImage?: string | null;
  coverTitle?: boolean;
  coverTone?: 'original' | 'newsprint';
  className?: string;
};

export function RetroArt({ kind = 'stripes', className = '' }: { kind?: string; className?: string }) {
  return <div className={`retro-art art-${kind} ${className}`} aria-hidden="true">
    <div className="art-disc" />
    <div className="art-ribbons"><i /><i /><i /><i /></div>
    <div className="art-lettering">Aa</div>
  </div>;
}

export default function PostCover({ title, cover, coverImage, coverTitle = false, coverTone = 'newsprint', className = '' }: CoverProps) {
  return <div className={`post-cover ${coverImage ? 'post-cover-photo' : 'post-cover-art'} post-cover-${coverTone} ${className}`} aria-hidden="true">
    {coverImage
      ? <img className="post-cover-image" src={coverImage} alt="" loading="lazy" decoding="async" />
      : <RetroArt kind={cover} />}
    {coverTitle && <span className="post-cover-title">{title || '새 글'}</span>}
  </div>;
}
