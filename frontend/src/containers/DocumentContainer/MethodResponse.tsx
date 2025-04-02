import { map } from 'lodash-es';

const MethodResponse: FunctionComponent<{ data: Record<string, string> }> = ({
  data,
}) => {
  return (
    <table className="bg-athens border-mist rounded-lg">
      <thead className="bg-snowflake text-left">
        <tr>
          <th className="w-[30%] px-4 py-2 font-semibold">Response</th>
          <th className="px-4 py-2 font-semibold"></th>
        </tr>
      </thead>
      <tbody className="px-4">
        {data ? (
          <>
            {map(data, (response, rIdx) => (
              <tr className="border-snowflake border-b" key={rIdx}>
                <td className="px-4 py-3 font-semibold">{response.name}</td>
                <td className="px-4 py-3">{response.option.type}</td>
              </tr>
            ))}
          </>
        ) : (
          <tr className="border-snowflake border-b">
            <td className="px-4 py-3">Empty response</td>
          </tr>
        )}
      </tbody>
    </table>
  );
};

export default MethodResponse;
