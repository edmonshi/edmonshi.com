import React from 'react';
import ProjectMedia from './ProjectMedia';

interface ProjectPanelProps {
    className?: string;
    title: string;
    imageUrl?: string;
    videoUrl?: string;
    demoUrl?: string;
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
    demoUrl,
    description,
    projectUrl,
    tags,
    icon,
    year,
}) => {
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
                <ProjectMedia key={videoUrl??imageUrl} className="panel-media" title={title}
                    src={videoUrl??imageUrl??''} video={!!videoUrl} />
            </a>
            {demoUrl && (
                <a className="project-demo" href={demoUrl} target="_blank" rel="noopener noreferrer">
                    Watch demo &rarr;
                </a>
            )}
        </div>
    );
};

export default ProjectPanel;
