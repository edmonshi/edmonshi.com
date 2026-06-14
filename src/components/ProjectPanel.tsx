import React, { useEffect, useRef } from 'react';

interface ProjectPanelProps {
    className?: string;
    title: string;
    imageUrl?: string;
    videoUrl?: string;
    description: string;
    projectUrl: string;
    tags?: string[];
    icon?: React.ReactNode;
    year?: string;
}

const ProjectPanel: React.FC<ProjectPanelProps> = ({
    className,
    title,
    imageUrl,
    videoUrl,
    description,
    projectUrl,
    tags,
    icon,
    year,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    // Defer video fetch + playback until the card nears the viewport; pause
    // (and stop decoding) when it leaves.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const io = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) video.play().catch(() => { });
            else video.pause();
        }, { rootMargin: '200px' });
        io.observe(video);
        return () => io.disconnect();
    }, []);

    return (
        <div className={className}>
            <a href={projectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="project-link"
            >
                {year && <span className="panel-year" aria-label={`Year ${year}`}>{year}</span>}
                <div className="panel-content">
                    <div className="panel-header">
                        <h3 className="panel-name">
                            {icon}
                            {title}
                        </h3>
                        {tags && tags.length > 0 && (
                            <div className="panel-tags">
                                {tags.map((tag, index) => (
                                    <span key={index} className="tech-tag">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <p className="panel-description">{description}</p>
                </div>
                <div className="panel-media">
                    {videoUrl ? (
                        <video
                            ref={videoRef}
                            className="panel-video"
                            src={videoUrl}
                            loop
                            muted
                            playsInline
                            preload="none"
                        />
                    ) : (
                        <img
                            className="panel-image"
                            src={imageUrl}
                            alt={title}
                        />
                    )}
                </div>
            </a>
        </div>
    );
};

export default ProjectPanel;