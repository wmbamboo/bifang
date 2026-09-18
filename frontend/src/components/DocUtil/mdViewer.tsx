import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownProps {
  source: string;
}

const MdViewer: React.FC<MarkdownProps> = ({ source }) => {
  return (
    <ReactMarkdown>
      {source}
    </ReactMarkdown>
  );
};

export default MdViewer;
