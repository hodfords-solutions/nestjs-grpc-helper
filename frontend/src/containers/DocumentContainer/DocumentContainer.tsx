import { useEffect, useState, useRef } from 'react';
import { map, find, get, forEach, head, toLower } from 'lodash-es';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { agate } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import TryboxModal from 'modals/TryboxModal';
import Sidebar from './Sidebar';
import Header from './Header';
import Loading from './Loading';
import PackageInstall from './PackageInstall';
import MethodParameters from './MethodParameters';
import MethodResponse from './MethodResponse';

const DocumentContainer: FunctionComponent = () => {
  const [isLoading, setLoading] = useState(false);
  const [isShowModal, setShowModal] = useState(false);
  const [documentData, setDocument] = useState([]);
  const itemRefs = useRef([]);
  const methodRefs = useRef([]);
  const modalData = useRef();
  let apiURL = null;

  useEffect(() => {
    getConfig();
  }, []);

  const getConfig = async () => {
    let config = null;
    try {
      const response = await fetch('./assets/config.json');
      config = await response.json();
    } catch (error) {
      const response = await fetch(
        `${window.location.origin}/assets/config.json`,
      );
      // const response = await fetch(
      //   `https://smype-grpc.dev.smype.com/assets/config.json`,
      // );
      config = await response.json();
    }
    apiURL = get(new URL(head(config)), 'origin');
    requestServiceData(config);
  };

  const toggleModal = (data) => {
    setShowModal((prev) => !prev);
    if (data) {
      const json = getMethodData(
        data.models,
        data.method.parameter || data.method.response,
      );
      modalData.current = {
        methodName: data.method.name,
        isFindMany: data.method.isResponseArray,
        serviceName: data.serviceName,
        url: data.url,
        json,
      };
    }
  };

  const requestServiceData = async (urls) => {
    try {
      setLoading(true);
      const responses = await Promise.all(
        map(urls, (url) => fetch(`${url}json`)),
      );
      const data = await Promise.all(
        responses.map((response) => response.json()),
      );
      const docs = [];
      const menuItems = [];
      forEach(data, (res) => {
        if (res.package) {
          const service = toLower(
            `${res.package.replace('smype', '')}-service`,
          );
          docs.push({
            ...res,
            url: `${apiURL}/${service}/microservice-documents/test`,
          });
          menuItems.push({
            name: res.title,
            title: res.description,
            services: map(res.microservices, (service) => ({
              name: service.name,
              methods: map(service.methods, (method) => ({
                name: method.name,
                isResponseArray: method.isResponseArray,
              })),
            })),
          });
        }
      });
      setDocument({
        menuItems,
        docs,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onScrollContent = (name: string) => {
    itemRefs.current[name].scrollIntoView({ behavior: 'smooth' });
  };

  const toggleMethodService = (name: string) => {
    const method = methodRefs.current[name];
    if (method.style.maxHeight) {
      method.style.removeProperty('max-height');
      method.previousElementSibling.classList.remove(
        'bg-sky-500/100',
        'text-white',
      );
    } else {
      method.previousElementSibling.classList.add(
        'bg-sky-500/100',
        'text-white',
      );
      method.style.maxHeight = `${method.scrollHeight}px`;
    }
  };

  const getMethodData = (model, id) => {
    return get(find(model, { classId: id }), 'properties');
  };

  return (
    <div className="flex justify-center h-screen bg-white">
      {isLoading && <Loading />}
      {!isLoading && (
        <>
          <Sidebar
            onScrollContent={onScrollContent}
            menuItems={documentData.menuItems}
          />
          <div className="flex flex-1 flex-col">
            <Header />
            <main className="custom-scrollbar overflow-auto px-8">
              {map(documentData.docs, (doc, index) => (
                <div className="document-data" key={index}>
                  <PackageInstall doc={doc} />
                  {map(doc.microservices, (service, idx) => (
                    <section
                      className="py-4"
                      key={idx}
                      ref={(el) =>
                        (itemRefs.current[`${doc.package}_${service.name}`] =
                          el)
                      }
                    >
                      <h2 className="text-onyx text-xl font-semibold">
                        {service.name}
                      </h2>
                      <div className="border-snowflake mt-4 mb-2 border-t"></div>
                      <div className="accordion flex flex-col gap-1">
                        {map(service.methods, (method, i) => (
                          <div
                            className="accordion-item border-mist rounded-xl border"
                            key={i}
                            ref={(el) =>
                              (itemRefs.current[
                                `${doc.package}_${method.name}`
                              ] = el)
                            }
                          >
                            <h4
                              onClick={() =>
                                toggleMethodService(
                                  `${doc.package}_${method.name}`,
                                )
                              }
                              className="accordion-header text-gunmetal hover:bg-sky-500/100 hover:text-white flex cursor-pointer items-center justify-between rounded-t-lg px-3 py-4 leading-5 font-semibold"
                            >
                              {method.name}
                              <svg
                                width="14"
                                height="8"
                                viewBox="0 0 14 8"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                className="arrow-icon"
                              >
                                <path
                                  d="M12.8333 7.12498C12.6733 7.12498 12.5133 7.06417 12.3916 6.94167L6.99998 1.55003L1.60834 6.94167C1.36417 7.18584 0.968307 7.18584 0.724141 6.94167C0.479974 6.6975 0.479974 6.30164 0.724141 6.05747L6.55747 0.224141C6.80164 -0.020026 7.1975 -0.020026 7.44167 0.224141L13.275 6.05747C13.5192 6.30164 13.5192 6.6975 13.275 6.94167C13.1533 7.06417 12.9933 7.12498 12.8333 7.12498Z"
                                  fill="#434D57"
                                />
                              </svg>
                            </h4>
                            <div
                              ref={(el) =>
                                (methodRefs.current[
                                  `${doc.package}_${method.name}`
                                ] = el)
                              }
                              className="accordion-content max-h-0 overflow-hidden transition-all duration-300"
                            >
                              <p className="px-3 py-2">{method.description}</p>
                              <div className="flex flex-col gap-3 px-3 pt-2 pb-4">
                                <SyntaxHighlighter
                                  language="javascript"
                                  style={agate}
                                  customStyle={{ margin: 0 }}
                                  wrapLines
                                  wrapLongLines
                                  lineProps={() => ({
                                    style: {
                                      display: 'block',
                                      cursor: 'pointer',
                                    },
                                  })}
                                >
                                  {method.sdkUsage}
                                </SyntaxHighlighter>
                                <button
                                  onClick={() =>
                                    toggleModal({
                                      method,
                                      serviceName: service.name,
                                      models: doc.models,
                                      url: doc.url,
                                    })
                                  }
                                  className="open-try-modal border-cloud w-max cursor-pointer rounded-sm border px-4 py-1.5"
                                >
                                  Try it now
                                </button>
                                <MethodParameters
                                  data={getMethodData(
                                    doc.models,
                                    method.parameter,
                                  )}
                                />
                                <MethodResponse
                                  data={getMethodData(
                                    doc.models,
                                    method.response,
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ))}
            </main>
            {isShowModal && (
              <TryboxModal data={modalData.current} onClose={toggleModal} />
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default DocumentContainer;
