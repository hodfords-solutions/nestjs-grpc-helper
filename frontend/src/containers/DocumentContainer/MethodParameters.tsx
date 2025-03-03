import { map } from 'lodash-es';

const MethodParameters: FunctionComponent<{ data: Record<string, string> }> = ({
  data,
}) => {
  return (
    <table className="bg-athens border-mist rounded-lg">
      <thead className="bg-snowflake text-left">
        <tr>
          <th className="px-4 py-2 font-semibold">Parameter</th>
          <th className="px-4 py-2 font-semibold"></th>
        </tr>
      </thead>
      <tbody className="px-4">
        {data ? (
          <>
            {map(data, (parameter, pIdx) => (
              <tr key={pIdx}>
                <td className="w-[30%] px-4 py-3 font-semibold">
                  {parameter.name}
                </td>
                <td className="px-4 py-3">{parameter.option.type}</td>
              </tr>
            ))}
          </>
        ) : (
          <tr className="border-snowflake border-b">
            <td className="px-4 py-3">Empty parameter</td>
          </tr>
        )}
      </tbody>
    </table>
  );
};

export default MethodParameters;
