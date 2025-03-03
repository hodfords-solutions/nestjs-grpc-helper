import SyntaxHighlighter from 'react-syntax-highlighter';
import { agate, docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';

const PackageInstall: FunctionComponent<{ doc: Record<string, string> }> = ({
  doc,
}) => {
  return (
    <section className="py-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{doc.title}</h1>
        <p className="text-storm leading-5">{doc.description}</p>
      </div>
      <div className="border-snowflake my-4 border-t"></div>
      <div className="flex flex-col gap-3">
        <SyntaxHighlighter
          language="javascript"
          style={docco}
          customStyle={{ margin: 0 }}
          wrapLines
          wrapLongLines
          lineProps={() => ({
            style: { display: 'block', cursor: 'pointer' },
          })}
        >
          {`npm install --save @grpc/grpc-js @grpc/proto-loader \nnpm install --save @hodfords/nestjs-response @hodfords/nestjs-command`}
        </SyntaxHighlighter>
        <SyntaxHighlighter
          language="javascript"
          style={docco}
          customStyle={{ margin: 0 }}
          wrapLines
          wrapLongLines
          lineProps={() => ({
            style: { display: 'block', cursor: 'pointer' },
          })}
        >
          {doc.installDescription}
        </SyntaxHighlighter>
        <SyntaxHighlighter
          language="javascript"
          style={agate}
          customStyle={{ margin: 0 }}
          wrapLines
          wrapLongLines
          lineProps={() => ({
            style: { display: 'block', cursor: 'pointer' },
          })}
        >
          {doc.usageDescription}
        </SyntaxHighlighter>
      </div>
    </section>
  );
};

export default PackageInstall;
