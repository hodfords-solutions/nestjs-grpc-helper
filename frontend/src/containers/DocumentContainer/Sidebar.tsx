import { useRef, useEffect, useState, useMemo } from 'react';
import { map, head, filter, toLower } from 'lodash-es';

const Sidebar: FunctionComponent<{
  menuItems: Record<string, string>;
  onScrollContent: (name: string) => void;
}> = ({ menuItems, onScrollContent }) => {
  const itemRefs = useRef([]);
  const [keyword, searchKeyword] = useState('');

  useEffect(() => {
    const fistItem = head(itemRefs.current);
    if (fistItem) {
      fistItem.style.maxHeight = `${fistItem.scrollHeight}px`;
    }
  }, []);

  const filterMenuItems = useMemo(() => {
    return filter(menuItems, (pkg) => {
      const services = filter(pkg.services, (service) => {
        const methods = filter(service.methods, (method) => {
          return toLower(method.name).includes(toLower(keyword));
        });
        return (
          toLower(service.name).includes(toLower(keyword)) || methods.length > 0
        );
      });
      return (
        toLower(pkg.name).includes(toLower(keyword)) || services.length > 0
      );
    });
  }, [keyword]);

  const toggleMenuItem = (idx: number) => {
    const menu = itemRefs.current[idx];
    if (menu.style.maxHeight) {
      menu.style.removeProperty('max-height');
    } else {
      menu.style.maxHeight = `${menu.scrollHeight}px`;
    }
  };

  return (
    <aside className="bg-athens border-snowflake flex w-[300px] flex-col gap-6 border-r p-4">
      <div className="border-mist flex h-10 items-center gap-2 rounded-lg border px-4 py-2">
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M1.6665 9.22464C1.6665 5.0504 5.0504 1.6665 9.22464 1.6665C13.3989 1.6665 16.7828 5.0504 16.7828 9.22464C16.7828 11.1025 16.098 12.8204 14.9644 14.1422L18.1629 17.3407C18.3899 17.5677 18.3899 17.9358 18.1629 18.1629C17.9358 18.3899 17.5677 18.3899 17.3407 18.1629L14.1422 14.9644C12.8204 16.098 11.1025 16.7828 9.22464 16.7828C5.0504 16.7828 1.6665 13.3989 1.6665 9.22464ZM9.22464 2.82929C5.69259 2.82929 2.82929 5.69259 2.82929 9.22464C2.82929 12.7567 5.69259 15.62 9.22464 15.62C12.7567 15.62 15.62 12.7567 15.62 9.22464C15.62 5.69259 12.7567 2.82929 9.22464 2.82929Z"
            fill="#99A4B0"
          />
        </svg>
        <input
          type="search"
          placeholder="Find anything"
          className="placeholder:text-nimbus flex-1 outline-none"
          onChange={(e) => searchKeyword(e.target.value)}
        />
      </div>

      <nav className="accordion custom-scrollbar flex-1 overflow-y-auto">
        {map(filterMenuItems, (item, index) => (
          <section className="flex flex-col gap-1" key={index}>
            <header
              onClick={() => toggleMenuItem(index)}
              className="accordion-header hover:bg-snowflake flex cursor-pointer items-center justify-between rounded-xl p-2"
            >
              <h3 className="text-onyx text-xl leading-5 font-semibold">
                {item.name}
              </h3>
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
            </header>
            <div
              ref={(el) => (itemRefs.current[index] = el)}
              className="accordion-content flex flex-col gap-1 max-h-0 overflow-hidden transition-all duration-300"
            >
              {map(item.services, (service, idx) => (
                <div className="flex flex-col gap-1" key={idx}>
                  <h4
                    onClick={() =>
                      onScrollContent(`${item.name}_${service.name}`)
                    }
                    className="text-gunmetal py-2 pr-2 pl-3 leading-5 font-semibold cursor-pointer"
                  >
                    {service.name}
                  </h4>
                  {map(service.methods, (method, i) => (
                    <span
                      key={i}
                      onClick={() =>
                        onScrollContent(`${item.name}_${method.name}`)
                      }
                      className="hover:bg-snowflake text-gunmetal cursor-pointer rounded-xl py-2 pr-2 pl-4 leading-5"
                    >
                      {method.name}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
        <div className="border-mist my-3 border-t"></div>
      </nav>
    </aside>
  );
};

export default Sidebar;
