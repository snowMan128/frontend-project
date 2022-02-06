import React, { FormEvent, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Dropdown, Menu } from "antd";

import { isArraysEqual } from "../../utils/utilities";
import { LsChevron } from "../../assets/icons";
import TreeStructure, { RowItem, RowProps } from "../TreeStructure/TreeStructure";
import { useToggle } from "../../hooks/useToggle";

import styles from "./Taxonomy.module.scss";

type TaxonomyPath = string[]
type onAddLabelCallback = (path: string[]) => any
type onDeleteLabelCallback = (path: string[]) => any

type TaxonomyItem = {
  label: string,
  path: TaxonomyPath,
  depth: number,
  children?: TaxonomyItem[],
  origin?: "config" | "user" | "session",
}

type TaxonomyOptions = {
  leafsOnly?: boolean,
  showFullPath?: boolean,
  pathSeparator?: string,
  maxUsages?: number,
  placeholder?: string,
}

type TaxonomyOptionsContextValue = TaxonomyOptions & {
  onAddLabel?: onAddLabelCallback,
  onDeleteLabel?: onDeleteLabelCallback,
  maxUsagesReached?: boolean,
}

type TaxonomyProps = {
  items: TaxonomyItem[],
  selected: TaxonomyPath[],
  onChange: (node: any, selected: TaxonomyPath[]) => any,
  onAddLabel?: onAddLabelCallback,
  onDeleteLabel?: onDeleteLabelCallback,
  options?: TaxonomyOptions,
}

type TaxonomySelectedContextValue = [
  TaxonomyPath[],
  (path: TaxonomyPath, value: boolean) => any,
]

const TaxonomySelectedContext = React.createContext<TaxonomySelectedContextValue>([[], () => undefined]);
const TaxonomyOptionsContext = React.createContext<TaxonomyOptionsContextValue>({});

type UserLabelFormProps = {
  onAddLabel: (path: string[]) => any,
  onFinish?: () => any,
  path: string[],
}

const UserLabelForm = ({ onAddLabel, onFinish, path }: UserLabelFormProps) => {
  const addRef = useRef<HTMLInputElement>(null);
  const onAdd = (e: React.KeyboardEvent<HTMLInputElement> | React.FocusEvent) => {
    if (!addRef.current) return;

    const value = addRef.current.value;
    const isEscape = "key" in e && e.key === "Escape";
    const isEnter = "key" in e && e.key === "Enter";
    const isBlur = e.type === "blur";

    if (isEscape) e.stopPropagation();

    // just do nothing, maybe misclick
    if (isEnter && !value) return;

    if ((isBlur || isEnter) && value) onAddLabel([...path, value]);

    // event fires on every key, so important to check
    if (isBlur || isEnter || isEscape) {
      addRef.current.value = "";
      onFinish?.();
    }
  };

  // autofocus; this also allows to close form on every action, because of blur event
  useEffect(() => addRef.current?.focus(), []);

  return (
    <div className={styles.taxonomy__newitem}>
      <input name="taxonomy__add" onKeyDownCapture={onAdd} onBlur={onAdd} ref={addRef} />
    </div>
  );
};

const SelectedList = () => {
  const [selected, setSelected] = useContext(TaxonomySelectedContext);
  const { showFullPath, pathSeparator = " / " } = useContext(TaxonomyOptionsContext);

  return (
    <div className={styles.taxonomy__selected}>
      {selected.map(path => (
        <div key={path.join("|")}>
          {showFullPath ? path.join(pathSeparator) : path[path.length - 1]}
          <input type="button" onClick={() => setSelected(path, false)} value="×" />
        </div>
      ))}
    </div>
  );
};

// check if item is child of parent (i.e. parent is leading subset of item)
function isSubArray(item: string[], parent: string[]) {
  if (item.length <= parent.length) return false;
  return parent.every((n, i) => item[i] === n);
}

const Item: React.FC<any> = (props: RowProps) => {
  const { data: { isLeaf, name, padding, path, updateHeight }, isOpen, style, toggle  } = props;


  const [selected, setSelected] = useContext(TaxonomySelectedContext);
  const isChildSelected = selected.some(current => isSubArray(current, path));
  const checked = selected.some(current => isArraysEqual(current, path));

  const { leafsOnly } = useContext(TaxonomyOptionsContext);
  const prefix = !isLeaf ? (isOpen ? "-" : "+") : " ";

  const setIndeterminate = useCallback(el => {
    if (!el) return;
    if (checked) el.indeterminate = false;
    else el.indeterminate = isChildSelected;
  }, [checked, isChildSelected]);

  const onClick = () => {
    if(leafsOnly) {
      toggle();
      updateHeight();
    }
  };
  const onChangeGroupingVisibility = () => {
    toggle().then(()=> 
      updateHeight(),
    );
  };

  return (
    <div className="item-tracker">
      <div className={styles.taxonomy__item} style={{
        ...style,
        paddingLeft: padding,
      }}>
        <div className={styles.taxonomy__grouping} onClick={onChangeGroupingVisibility}>{prefix}</div>
        <label
          onClick={onClick}
          title={name}
          className={styles.taxonomy__collapsable}
        >
          <input
            type="checkbox"
            checked={checked}
            ref={setIndeterminate}
            onChange={e => setSelected(path, e.currentTarget.checked)}
          />
          {name}
        </label>
        {!isFiltering && (
          <div className={styles.taxonomy__extra}>
            {/* @todo should count all the nested children */}
            <span className={styles.taxonomy__extra_count}>
              {item.children?.length}
            </span>
            {onAddLabel && (
              <div className={styles.taxonomy__extra_actions}>
                <Dropdown
                  destroyPopupOnHide // important for long interactions with huge taxonomy
                  trigger={["click"]}
                  overlay={(
                    <Menu>
                      <Menu.Item
                        key="add-inside"
                        className={styles.taxonomy__action}
                        onClick={addInside}
                      >Add Inside</Menu.Item>
                      {item.origin === "session" && (
                        <Menu.Item
                          key="delete"
                          className={styles.taxonomy__action}
                          onClick={onDelete}
                        >Delete</Menu.Item>
                      )}
                    </Menu>
                  )}
                >
                  <div>
                    ...
                  </div>
                </Dropdown>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

type TaxonomyDropdownProps = {
  dropdownRef: React.Ref<HTMLDivElement>,
  flatten: TaxonomyItem[],
  items: TaxonomyItem[],
  show: boolean,
}

const filterTreeByPredicate = (
  flatten: TaxonomyItem[],
  predicate: (item: TaxonomyItem) => boolean,
) => {
  const roots: TaxonomyItem[] = [];
  const childs: TaxonomyItem[][] = [];
  let d = -1;

  for (let i = flatten.length; i--; ) {
    const item = flatten[i];

    if (item.depth === d) {
      const adjusted: TaxonomyItem = { ...item, children: childs[d] ?? [] };

      childs[d] = [];
      if (d) {
        if (!childs[d - 1]) childs[d - 1] = [];
        childs[d - 1].unshift(adjusted);
      } else {
        roots.unshift(adjusted);
      }
      d--;
      continue;
    }

    if (predicate(item)) {
      const adjusted = { ...item, children: [] };

      if (item.depth === 0) {
        roots.unshift(adjusted);
      } else {
        d = item.depth - 1;
        if (!childs[d]) childs[d] = [];
        childs[d].unshift(adjusted);
      }
    }
  }

  return roots;
};

const itemDataReformater = (
  { node: { children, label, depth, path }, nestingLevel } :
  { node: RowItem, nestingLevel: number}) => (
  {
    id: `${label}-${depth}`,
    isLeaf: !children?.length,
    isOpenByDefault: true,
    name: label,
    nestingLevel: depth,
    padding: nestingLevel * 20,
    path,
  }
);


const TaxonomyDropdown = ({ show, flatten, items, dropdownRef }: TaxonomyDropdownProps) => {

  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const predicate = (item: TaxonomyItem) => item.label.toLocaleLowerCase().includes(search);
  const onInput = (e: FormEvent<HTMLInputElement>) => setSearch(e.currentTarget.value.toLocaleLowerCase());
  const { onAddLabel } = useContext(TaxonomyOptionsContext);
  const [isAdding, addInside, closeForm] = useToggle(false);

  const list = search ? filterTreeByPredicate(flatten, predicate) : items;

  useEffect(() => {
    const input = inputRef.current;

    if (show && input) {
      input.value = "";
      input.focus();
      setSearch("");
    }
  }, [show]);

  return (
    <div className={styles.taxonomy__dropdown} ref={dropdownRef} style={{ display: show ? "block" : "none" }}>
<<<<<<< HEAD
      <input
        autoComplete="off"
        className={styles.taxonomy__search}
        name="taxonomy__search"
        placeholder="Search..."
        onInput={onInput}
        ref={inputRef}
      />
      {list.map(item => <Item key={item.label} item={item} isFiltering={search !== ""} />)}
      {onAddLabel && search === "" && (
        isAdding
          ? <UserLabelForm path={[]} onAddLabel={onAddLabel} onFinish={closeForm} />
          : <div className={styles.taxonomy__add}><button onClick={addInside}>Add</button></div>
      )}
=======
      <div className={styles.taxonomy__input_padding}>
        <input
          autoComplete="off"
          className={styles.taxonomy__search}
          name="taxonomy__search"
          placeholder="Search..."
          onInput={onInput}
          ref={inputRef}
        />
      </div>
>>>>>>> 6314a39d (imput and scrollbar padding adjustment, fix height on search and browser percentage calcualtion)
      <TreeStructure 
        items={list} 
        rowComponent={Item} 
        flatten={search !== ""} 
        rowHeight={30}
        maxHeightPersentage={60}
        transformationCallback={itemDataReformater}
      />
    </div>
  );
};

const Taxonomy = ({ items, selected: externalSelected, onChange, onAddLabel, onDeleteLabel, options = {} }: TaxonomyProps) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const taxonomyRef = useRef<HTMLDivElement>(null);
  const [isOpen, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const onClickOutside = useCallback(e => {
    const cn = styles.taxonomy__action;

    // don't close dropdown if user clicks on action from context menu
    if ([e.target, e.target.parentNode].some(n => n?.classList?.contains(cn))) return;
    if (!taxonomyRef.current?.contains(e.target)) close();
  }, []);
  const onEsc = useCallback(e => {
    if (e.key === "Escape") {
      close();
      e.stopPropagation();
    }
  }, []);

  const isOpenClassName = isOpen ? styles.taxonomy_open : "";

  const flatten = useMemo(() => {
    const flatten: TaxonomyItem[] = [];
    const visitItem = (item: TaxonomyItem) => {
      flatten.push(item);
      item.children?.forEach(visitItem);
    };

    items.forEach(visitItem);
    return flatten;
  }, [items]);

  const [selected, setInternalSelected] = useState(externalSelected);
  const contextValue: TaxonomySelectedContextValue = useMemo(() => {
    const setSelected = (path: TaxonomyPath, value: boolean) => {
      const newSelected = value
        ? [...selected, path]
        : selected.filter(current => !isArraysEqual(current, path));

      setInternalSelected(newSelected);
      onChange && onChange(null, newSelected);
    };

    return [selected, setSelected];
  }, [selected]);

  const optionsWithMaxUsages = useMemo(() => {
    const maxUsagesReached = options.maxUsages ? selected.length >= options.maxUsages : false;

    return { ...options, maxUsagesReached, onAddLabel, onDeleteLabel };
  }, [options, options.maxUsages, options.maxUsages ? selected : 0]);

  useEffect(() => {
    setInternalSelected(externalSelected);
  }, [externalSelected]);

  useEffect(() => {
    if (isOpen) {
      document.body.addEventListener("click", onClickOutside, true);
      document.body.addEventListener("keydown", onEsc);
    } else {
      document.body.removeEventListener("click", onClickOutside);
      document.body.removeEventListener("keydown", onEsc);
    }
  }, [isOpen]);

  return (
    <TaxonomySelectedContext.Provider value={contextValue}>
      <TaxonomyOptionsContext.Provider value={optionsWithMaxUsages}>
        <SelectedList />
        <div className={[styles.taxonomy, isOpenClassName].join(" ")} ref={taxonomyRef}>
          <span onClick={() => setOpen(val => !val)}>
            {options.placeholder || "Click to add..."}
            <LsChevron stroke="#09f" />
          </span>
          <TaxonomyDropdown show={isOpen} items={items} flatten={flatten} dropdownRef={dropdownRef} />
        </div>
      </TaxonomyOptionsContext.Provider>
    </TaxonomySelectedContext.Provider>
  );
};

export { Taxonomy };

