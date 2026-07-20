import { Message } from '../utils/MessageUtils.js';

/**
 * 创建添加分组表单
 * 表单本身不写入数据，收集输入后交给 onSave 处理（避免重复添加）
 * @param {Function} onSave - 保存回调，参数为 { name, active }
 * @param {Function} onCancel - 取消回调
 * @returns {HTMLElement} - 表单DOM元素
 */
export function createAddGroupForm (onSave, onCancel) {
  const formContainer = document.createElement('div');
  formContainer.className = 'batch-import-section add-group-form';
  formContainer.style.marginBottom = '24px';

  const formTitle = document.createElement('h3');
  formTitle.className = 'section-title';
  formTitle.textContent = '添加新分组';
  formContainer.appendChild(formTitle);

  // 分组名称输入
  const nameFormGroup = document.createElement('div');
  nameFormGroup.className = 'form-group';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = '分组名称:';
  nameLabel.htmlFor = 'group-name';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'group-name';
  nameInput.placeholder = '例如：测试环境';
  nameInput.maxLength = 50;

  nameFormGroup.appendChild(nameLabel);
  nameFormGroup.appendChild(nameInput);
  formContainer.appendChild(nameFormGroup);

  // 启用分组切换
  const enableGroup = document.createElement('div');
  enableGroup.className = 'form-row';
  enableGroup.style.marginTop = '16px';

  const enableLabel = document.createElement('label');
  enableLabel.textContent = '启用分组:';
  enableLabel.style.marginBottom = '0';

  const toggleSwitch = document.createElement('label');
  toggleSwitch.className = 'toggle-switch';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'group-enabled';
  checkbox.checked = true;

  const slider = document.createElement('span');
  slider.className = 'slider';

  toggleSwitch.appendChild(checkbox);
  toggleSwitch.appendChild(slider);

  enableGroup.appendChild(enableLabel);
  enableGroup.appendChild(toggleSwitch);
  formContainer.appendChild(enableGroup);

  // 表单操作按钮
  const formActions = document.createElement('div');
  formActions.className = 'form-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'button button-default';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => {
    if (onCancel) onCancel();
  });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'button button-primary';
  saveBtn.textContent = '创建分组';

  const submit = async () => {
    const name = nameInput.value.trim();

    if (!name) {
      Message.error('请输入分组名称');
      nameInput.focus();
      return;
    }

    saveBtn.disabled = true;
    try {
      if (onSave) {
        await onSave({ name, active: checkbox.checked });
      }
    } finally {
      saveBtn.disabled = false;
    }
  };

  saveBtn.addEventListener('click', submit);
  nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      submit();
    }
  });

  formActions.appendChild(cancelBtn);
  formActions.appendChild(saveBtn);
  formContainer.appendChild(formActions);

  // 自动聚焦名称输入框
  setTimeout(() => nameInput.focus(), 50);

  return formContainer;
}
