import { useRef, useEffect, useState } from 'react';
import { map, assign, omit } from 'lodash-es';
import JSONEditor from 'jsoneditor';
import JsonView from '@uiw/react-json-view';
import { lightTheme } from '@uiw/react-json-view/light';

const TryboxModal: FunctionComponent<{
  data: Record<string, string>;
  onClose: () => void;
}> = ({ onClose, data }) => {
  const modalRef = useRef();
  const modalContentRef = useRef();
  const jsonEditorRef = useRef();
  const [responseData, setResponseData] = useState();
  const [isLoading, setLoading] = useState();
  let editor = null;

  useEffect(() => {
    if (jsonEditorRef.current) {
      editor = new JSONEditor(jsonEditorRef.current, {
        mode: 'code',
        statusBar: false,
      });
    }
    const jsonData = map(data.json, (j) => ({
      [j.name]: j.option.example || '',
    }));
    editor.set(assign({}, ...jsonData));
    modalRef.current.classList.remove('hidden');
    setTimeout(() => {
      if (modalRef.current) {
        modalRef.current.classList.add('opacity-100');
        modalContentRef.current.classList.add('scale-100', 'opacity-100');
      }
    }, 10);
  }, []);

  const closeModal = () => {
    modalRef.current.classList.remove('opacity-100');
    modalContentRef.current.classList.remove('scale-100', 'opacity-100');

    setTimeout(() => {
      modalRef.current.classList.add('hidden');
      onClose();
    }, 200);
  };

  const tryIt = async () => {
    try {
      setLoading(true);
      const payload = {
        ...omit(data, ['url', 'json']),
        data: editor.get(),
      };
      const response = await fetch(data.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      setResponseData({
        status: response.status,
        headers: response.headers,
        statusText: response.statusText,
        body,
        ok: response.ok,
        bodyUsed: response.bodyUsed,
        redirected: response.redirected,
        type: response.type,
        url: response.url,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={modalRef}
      className="fixed top-0 left-0 z-[999] h-full w-full overflow-auto bg-black/50 transition-opacity duration-500"
    >
      <div
        ref={modalContentRef}
        className="mx-auto my-7 w-[800px] scale-95 transform rounded-lg bg-white opacity-0 shadow-xl transition-all duration-500"
      >
        <div className="border-mist flex items-center justify-between border-b p-6">
          <h4 className="text-gunmetal text-xl leading-5 font-semibold">
            {data.methodName}
          </h4>
          <svg
            id="close-modal"
            onClick={closeModal}
            className="cursor-pointer"
            width="20"
            height="21"
            viewBox="0 0 20 21"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M4.33209 4.832C4.55255 4.61154 4.90998 4.61154 5.13044 4.832L10.0001 9.70164L14.8697 4.832C15.0902 4.61154 15.4476 4.61154 15.6681 4.832C15.8885 5.05246 15.8885 5.40989 15.6681 5.63035L10.7984 10.5L15.6681 15.3696C15.8885 15.5901 15.8885 15.9475 15.6681 16.168C15.4476 16.3884 15.0902 16.3884 14.8697 16.168L10.0001 11.2983L5.13044 16.168C4.90998 16.3884 4.55255 16.3884 4.33209 16.168C4.11163 15.9475 4.11163 15.5901 4.33209 15.3696L9.20174 10.5L4.33209 5.63035C4.11163 5.40989 4.11163 5.05246 4.33209 4.832Z"
              fill="#020303"
            />
          </svg>
        </div>
        <div className="py-6">
          <h4 className="bg-snowflake mb-4 px-6 py-3 font-semibold">
            Parameter
          </h4>
          <div className="flex flex-col gap-4 px-6">
            <div ref={jsonEditorRef} className="h-[236px]"></div>
            <button
              onClick={tryIt}
              disabled={isLoading}
              className="try-service-button flex flex-row items-center border-cloud bg-gunmetal w-max cursor-pointer self-end rounded-sm border px-4 py-1.5 text-white hover:opacity-90 disabled:opacity-70"
            >
              {isLoading && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 200 200"
                  width="30"
                  height="30"
                  className="mr-2"
                >
                  <radialGradient
                    id="a10"
                    cx=".66"
                    fx=".66"
                    cy=".3125"
                    fy=".3125"
                    gradientTransform="scale(1.5)"
                  >
                    <stop offset="0" stopColor="#FFFFFF"></stop>
                    <stop
                      offset=".3"
                      stopColor="#FFFFFF"
                      stopOpacity=".9"
                    ></stop>
                    <stop
                      offset=".6"
                      stopColor="#FFFFFF"
                      stopOpacity=".6"
                    ></stop>
                    <stop
                      offset=".8"
                      stopColor="#FFFFFF"
                      stopOpacity=".3"
                    ></stop>
                    <stop offset="1" stopColor="#FFFFFF" stopOpacity="0"></stop>
                  </radialGradient>
                  <circle
                    transformOrigin="center"
                    fill="none"
                    stroke="url(#a10)"
                    strokeWidth="15"
                    strokeLinecap="round"
                    strokeDasharray="200 1000"
                    strokeDashoffset="0"
                    cx="100"
                    cy="100"
                    r="70"
                  >
                    <animateTransform
                      type="rotate"
                      attributeName="transform"
                      calcMode="spline"
                      dur="2"
                      values="360;0"
                      keyTimes="0;1"
                      keySplines="0 0 1 1"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle
                    transformOrigin="center"
                    fill="none"
                    opacity=".2"
                    stroke="#FFFFFF"
                    strokeWidth="15"
                    strokeLinecap="round"
                    cx="100"
                    cy="100"
                    r="70"
                  />
                </svg>
              )}
              Try it
            </button>
            {responseData && (
              <>
                <h4 className="bg-snowflake mb-4 px-6 py-3 font-semibold">
                  Response
                </h4>
                <div className="flex flex-col gap-4 px-6">
                  <JsonView value={responseData} style={lightTheme} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TryboxModal;
