import React from 'react';

interface ProjectPanelProps {
    className?: string;
    title: string;
    imageUrl?: string;
    videoUrl?: string;
    description: string;
    projectUrl: string;
    tags?: string[];
}

const ProjectPanel: React.FC<ProjectPanelProps> = ({
    className,
    title,
    imageUrl,
    videoUrl,
    description,
    projectUrl,
    tags,
}) => {
    return (
        <div className={className}>
            <a href={projectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="project-link"
            >
                <div className="panel-content">
                    <div className="panel-header">
                        <h3 className="panel-name">{title}</h3>
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
                            className="panel-video"
                            src={videoUrl}
                            autoPlay
                            loop
                            muted
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