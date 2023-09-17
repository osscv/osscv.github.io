export class WebUtils {
  static create(type, style, cl) {
    const el = document.createElement(type || 'div');
    if (style) el.style = style;
    if (cl) el.className = cl;
    return el;
  }

  static setupTabIndex(element) {
    element.tabIndex = 0;
    element.addEventListener('keydown', (e) => {
      if (e.key == 'Enter') {
        element.click();
        e.stopPropagation();
      }
    });
  }

  static createPagesBar(page, totalPages, callback) {
    const create = this.create;
    const total = Math.min(totalPages, 1000);
    let start = Math.max(page - 5, 1);

    if (start + 10 > total) {
      start = Math.max(total - 10, 1);
    }

    const max = Math.min(start + 10, total);
    const list = create('div', null, 'page-bar');
    if (start > 1) {
      const el = create('div', null, 'page-marker');
      el.textContent = 1;
      el.addEventListener('click', () => {
        callback(1);
      });
      this.setupTabIndex(el);
      list.appendChild(el);

      if (start > 2) {
        const el = create('div', null, 'page-marker');
        el.textContent = '...';
        list.appendChild(el);
      }
    }
    for (let i = start; i <= max; i++) {
      ((i) => {
        const el = create('div', null, 'page-marker');
        el.textContent = i;
        if (i === page) {
          el.classList.add('selected');
          el.contentEditable = true;
          el.addEventListener('blur', () => {
            el.textContent = i;
            window.getSelection().empty();
          });
          el.addEventListener('focus', () => {
            window.getSelection().selectAllChildren(el);
          });
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              const page = parseInt(el.textContent);
              if (page > 0 && page <= total) {
                callback(parseInt(el.textContent));
              } else {
                el.textContent = i;
              }
            }
            e.stopPropagation();
          });
        } else {
          el.addEventListener('click', () => {
            callback(i);
          });
        }
        this.setupTabIndex(el);
        list.appendChild(el);
      })(i);
    }

    if (max < total) {
      if (max + 1 < total) {
        const el = create('div', null, 'page-marker');
        el.textContent = '...';
        list.appendChild(el);
      }

      const el = create('div', null, 'page-marker');
      el.textContent = total;
      el.addEventListener('click', () => {
        callback(total);
      });
      this.setupTabIndex(el);
      list.appendChild(el);
    }
    return list;
  }

  static setupDropdown(itemListElement, text, container, call) {
    container.addEventListener('click', (e) => {
      for (let j = 0; j < itemListElement.children.length; j++) {
        const element = itemListElement.children[j];
        if (element.dataset.val == container.dataset.val) {
          element.style.backgroundColor = '';
          const nextElement = (j < itemListElement.children.length - 1) ? itemListElement.children[j + 1] : itemListElement.children[0];
          nextElement.style.backgroundColor = 'rgb(20,20,20)';
          text.children[0].textContent = nextElement.textContent;
          container.dataset.val = nextElement.dataset.val;
          if (call) call(container.dataset.val);
          break;
        }
      }
      e.stopPropagation();
    });
    container.addEventListener('mouseleave', (e) => {
      container.blur();
    });

    container.addEventListener('keydown', (e) => {
      if (e.key == 'ArrowDown' ) {
        for (let j = 0; j < itemListElement.children.length; j++) {
          const element = itemListElement.children[j];
          if (element.dataset.val == container.dataset.val) {
            element.style.backgroundColor = '';
            const nextElement = (j < itemListElement.children.length - 1) ? itemListElement.children[j + 1] : itemListElement.children[0];
            nextElement.style.backgroundColor = 'rgb(20,20,20)';
            text.children[0].textContent = nextElement.textContent;
            container.dataset.val = nextElement.dataset.val;
            if (call) call(container.dataset.val);
            break;
          }
        }
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key == 'ArrowUp') {
        for (let j = 0; j < itemListElement.children.length; j++) {
          const element = itemListElement.children[j];
          if (element.dataset.val == container.dataset.val) {
            element.style.backgroundColor = '';
            const nextElement = (j > 0) ? itemListElement.children[j - 1] : itemListElement.children[itemListElement.children.length - 1];
            nextElement.style.backgroundColor = 'rgb(20,20,20)';
            text.children[0].textContent = nextElement.textContent;
            container.dataset.val = nextElement.dataset.val;
            if (call) call(container.dataset.val);
            break;
          }
        }
        e.preventDefault();
        e.stopPropagation();
      }
    });
    for (let i = 0; i < itemListElement.children.length; i++) {
      ((i) => {
        const el = itemListElement.children[i];

        el.addEventListener('click', (e) => {
          text.children[0].textContent = el.textContent;
          container.dataset.val = el.dataset.val;

          for (let j = 0; j < itemListElement.children.length; j++) {
            if (j == i) {
              itemListElement.children[j].style.backgroundColor = 'rgb(20,20,20)';
            } else {
              itemListElement.children[j].style.backgroundColor = '';
            }
          }
          e.stopPropagation();
          if (call) call(container.dataset.val);
        });
      })(i);
    }
  }

  static createDropdown(defaultChoice, title, items, call) {
    const create = this.create;
    const container = create('div', ``, 'dropdown');

    const text = create('div', ``);
    text.appendChild(document.createTextNode(`${title}: `));
    const span = create('span', `color: rgb(200,200,200)`);
    span.textContent = items[defaultChoice];
    text.appendChild(span);
    text.appendChild(document.createTextNode(' ˅'));

    container.dataset.val = defaultChoice;
    container.tabIndex = 0;
    container.appendChild(text);
    const itemListElement = create('div', `position: absolute; top: 100%; left: 0px; right: 0px;`, 'items');
    for (const name in items) {
      if (Object.hasOwn(items, name)) {
        const div = create('div');
        div.dataset.val = name;
        div.textContent = items[name];

        if (defaultChoice == name) {
          div.style.backgroundColor = 'rgb(20,20,20)';
        }
        itemListElement.appendChild(div);
      }
    }
    container.appendChild(itemListElement);
    this.setupDropdown(itemListElement, text, container, call);
    return container;
  }
}
