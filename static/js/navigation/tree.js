/*
 * Metadata Remote - Intelligent audio metadata editor
 * Copyright (C) 2025 Dr. William Nelson Leonard
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Tree Navigation Management for Metadata Remote
 * Handles folder tree loading, building, sorting, filtering, and interaction
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Navigation = window.MetadataRemote.Navigation || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    const API = window.MetadataRemote.API;
    const UIUtils = window.MetadataRemote.UI.Utilities;
    
    // Store callbacks that will be set during initialization
    let selectTreeItemCallback = null;
    let loadFilesCallback = null;
    
    // Drag and drop state
    let draggingFolder = null;
    
    window.MetadataRemote.Navigation.Tree = {
        /**
         * Initialize the tree module with required callbacks
         * @param {Function} selectTreeItem - Callback for selecting tree items
         * @param {Function} loadFiles - Callback for loading files
         */
        init(selectTreeItem, loadFiles) {
            selectTreeItemCallback = selectTreeItem;
            loadFilesCallback = loadFiles;
            
            // Set up the new folder controls
            this.setupFolderControls();
            
            // Set up folder button handlers
            this.setupFolderButtonHandlers();
            
            // Initialize drag and drop functionality
            this.initDragAndDrop();
        },
        
        /**
         * Set up filter and sort controls for folders pane
         */
        setupFolderControls() {
            // Filter button toggle
            const filterBtn = document.getElementById('folders-filter-btn');
            const filterContainer = document.getElementById('folders-filter');
            const filterInput = document.getElementById('folders-filter-input');
            
            if (filterBtn && filterContainer && filterInput) {
                filterBtn.addEventListener('click', () => {
                    const isActive = filterContainer.classList.contains('active');
                    
                    // Close any open sort dropdown
                    document.getElementById('folders-sort-dropdown').classList.remove('active');
                    State.activeSortDropdown = null;
                    
                    filterContainer.classList.toggle('active');
                    filterBtn.classList.toggle('active');
                    State.activeFilterPane = isActive ? null : 'folders';
                    
                    if (!isActive) {
                        filterInput.focus();
                        State.focusedPane = 'folders';
                    }
                });
                
                // Filter input handler
                filterInput.addEventListener('input', (e) => {
                    State.foldersFilter = e.target.value;
                    this.rebuildTree();
                });
            }
            
            // Sort field button
            const sortBtn = document.getElementById('folders-sort-btn');
            const sortDropdown = document.getElementById('folders-sort-dropdown');
            const sortDirection = document.getElementById('folders-sort-direction');
            const sortIndicator = document.getElementById('folders-sort-indicator');
            
            if (sortBtn && sortDropdown) {
                sortBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    // Close filter if open
                    filterContainer.classList.remove('active');
                    filterBtn.classList.remove('active');
                    State.activeFilterPane = null;
                    
                    const isActive = sortDropdown.classList.contains('active');
                    sortDropdown.classList.toggle('active');
                    State.activeSortDropdown = isActive ? null : 'folders';
                    State.focusedPane = 'folders';
                });
                
                // Sort direction toggle
                sortDirection.addEventListener('click', (e) => {
                    e.stopPropagation();
                    State.foldersSort.direction = State.foldersSort.direction === 'asc' ? 'desc' : 'asc';
                    this.updateSortUI();
                    this.rebuildTree();
                });
                
                // Sort options
                sortDropdown.querySelectorAll('.sort-option').forEach(option => {
                    option.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const sortBy = option.dataset.sort;
                        
                        // When selecting a new field, always start with ascending
                        State.foldersSort.method = sortBy;
                        State.foldersSort.direction = 'asc';
                        
                        this.updateSortUI();
                        this.rebuildTree();
                        sortDropdown.classList.remove('active');
                        State.activeSortDropdown = null;
                    });
                });
            }
            
            // Close dropdowns on outside click
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#folders-sort-dropdown') && !e.target.closest('#folders-sort-btn')) {
                    sortDropdown.classList.remove('active');
                    if (State.activeSortDropdown === 'folders') {
                        State.activeSortDropdown = null;
                    }
                }
            });
        },
        
        /**
         * Wire up create and delete folder buttons
         */
        setupFolderButtonHandlers() {
            const createBtn = document.getElementById('create-folder-btn');
            const deleteBtn = document.getElementById('delete-folder-btn');
            
            if (createBtn) {
                createBtn.onclick = () => this.showCreateFolderDialog();
            }
            
            if (deleteBtn) {
                deleteBtn.onclick = () => this.showDeleteFolderDialog();
            }
        },
        
        /**
         * Filter tree items based on filter text
         * @param {Array} items - Items to filter
         * @param {string} filterText - Filter text
         * @returns {Array} Filtered items
         */
        filterTreeItems(items, filterText) {
            if (!filterText) return items;
            const lower = filterText.toLowerCase();
            return items.filter(item => 
                item.name.toLowerCase().includes(lower)
            );
        },
        
        /**
         * Load the initial tree structure
         */
        async loadTree() {
            try {
                // Set loading state
                document.getElementById('folder-count').textContent = '(loading...)';
                
                const data = await API.loadTree();
                State.treeData[''] = data.items;
                this.buildTreeFromData();
                this.updateSortUI(); // Initialize sort UI
            } catch (err) {
                console.error('Error loading tree:', err);
                UIUtils.showStatus('Error loading folders', 'error');
                // Set error state
                document.getElementById('folder-count').textContent = '(error)';
            }
        },

        /**
         * Build the tree from loaded data
         */
        buildTreeFromData() {
            const tree = document.getElementById('folder-tree');
            tree.innerHTML = '';
            
            // Apply filtering first
            const filteredItems = this.filterTreeItems(State.treeData[''] || [], State.foldersFilter);
            const sortedItems = this.sortItems(filteredItems);
            
            let folderCount = 0;
            sortedItems.forEach(item => {
                if (item.type === 'folder') {
                    tree.appendChild(this.createTreeItem(item, 0));
                    folderCount++;
                }
            });
            
            // Update folder count in the header
            document.getElementById('folder-count').textContent = `(${folderCount})`;
            
            // Auto-select the first folder on initial load
            const firstTreeItem = tree.querySelector('.tree-item');
            if (firstTreeItem && !State.selectedTreeItem) {
                // Use the callback to select with keyboard focus
                selectTreeItemCallback(firstTreeItem, true);
                // Also set the focused pane to folders
                State.focusedPane = 'folders';
            }
        },

        /**
         * Rebuild the entire tree maintaining expanded state
         */
        rebuildTree() {
            this.buildTreeFromData();
            
            State.expandedFolders.forEach(path => {
                const element = document.querySelector(`[data-path="${path}"]`);
                if (element && State.treeData[path]) {
                    const children = element.querySelector('.tree-children');
                    if (children && State.treeData[path].length > 0) {
                        this.rebuildChildren(path, children, this.getLevel(path) + 1);
                        children.classList.add('expanded');
                        // Update folder icon
                        const icon = element.querySelector('.tree-icon');
                        if (icon) {
                            icon.innerHTML = '📂';
                        }
                    }
                }
            });
            
            if (State.selectedTreeItem) {
                const path = State.selectedTreeItem.dataset.path;
                const newSelected = document.querySelector(`[data-path="${path}"]`);
                if (newSelected) {
                    newSelected.classList.add('selected');
                    State.selectedTreeItem = newSelected;
                }
            }
        },

        /**
         * Get the depth level of a path
         * @param {string} path - Folder path
         * @returns {number} Depth level
         */
        getLevel(path) {
            return path ? path.split('/').length - 1 : 0;
        },

        /**
         * Rebuild children for a specific folder
         * @param {string} path - Folder path
         * @param {HTMLElement} container - Container element
         * @param {number} level - Depth level
         */
        rebuildChildren(path, container, level) {
            container.innerHTML = '';
            
            // Apply filtering first
            const filteredItems = this.filterTreeItems(State.treeData[path] || [], State.foldersFilter);
            const sortedItems = this.sortItems(filteredItems);
            
            sortedItems.forEach(item => {
                if (item.type === 'folder') {
                    container.appendChild(this.createTreeItem(item, level));
                }
            });
        },

        /**
         * Create a tree item element
         * @param {Object} item - Item data
         * @param {number} level - Depth level
         * @returns {HTMLElement} Tree item element
         */
        createTreeItem(item, level) {
            const div = document.createElement('div');
            div.className = 'tree-item';
            div.dataset.path = item.path;
            div.draggable = true;
            
            const content = document.createElement('div');
            content.className = 'tree-item-content';
            content.style.paddingLeft = `${level * 1.5 + 1.25}rem`;
            
            const icon = document.createElement('span');
            icon.className = 'tree-icon';
            icon.innerHTML = State.expandedFolders.has(item.path) ? '📂' : '📁';
            
            const name = document.createElement('span');
            name.textContent = item.name;
            
            content.appendChild(icon);
            content.appendChild(name);
            
            const children = document.createElement('div');
            children.className = 'tree-children';
            
            div.appendChild(content);
            div.appendChild(children);
            
            content.onclick = (e) => {
                e.stopPropagation();
                selectTreeItemCallback(div);
                
                // Check if this folder has subfolders
                const hasSubfolders = State.treeData[item.path] && 
                                     State.treeData[item.path].some(child => child.type === 'folder');
                
                const isExpanded = children.classList.contains('expanded');
                
                if (!isExpanded) {
                    if (children.children.length === 0) {
                        this.loadTreeChildren(item.path, children, level + 1);
                    }
                    children.classList.add('expanded');
                    State.expandedFolders.add(item.path);
                    icon.innerHTML = '📂';
                } else {
                    children.classList.remove('expanded');
                    State.expandedFolders.delete(item.path);
                    icon.innerHTML = '📁';
                }
            };
            
            // Add double-click handler for rename
            content.ondblclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.startFolderRename(div, item);
            };
            
            if (State.treeData[item.path] && State.treeData[item.path].length > 0 && State.expandedFolders.has(item.path)) {
                // Apply filtering to children
                const filteredChildren = this.filterTreeItems(State.treeData[item.path], State.foldersFilter);
                const sortedItems = this.sortItems(filteredChildren);
                sortedItems.forEach(child => {
                    if (child.type === 'folder') {
                        children.appendChild(this.createTreeItem(child, level + 1));
                    }
                });
                children.classList.add('expanded');
                icon.innerHTML = '📂';
            }
            
            return div;
        },

        /**
         * Load children for a tree node
         * @param {string} path - Folder path
         * @param {HTMLElement} container - Container element
         * @param {number} level - Depth level
         */
        async loadTreeChildren(path, container, level) {
            try {
                const data = await API.loadTreeChildren(path);
                State.treeData[path] = data.items;
                
                // Apply filtering
                const filteredItems = this.filterTreeItems(data.items, State.foldersFilter);
                const sortedItems = this.sortItems(filteredItems);
                
                sortedItems.forEach(item => {
                    if (item.type === 'folder') {
                        container.appendChild(this.createTreeItem(item, level));
                    }
                });
            } catch (err) {
                console.error('Error loading tree children:', err);
            }
        },

        /**
         * Sort items based on current sort settings
         * @param {Array} items - Items to sort
         * @returns {Array} Sorted items
         */
        sortItems(items) {
            return items.sort((a, b) => {
                let comparison = 0;
                
                if (State.foldersSort.method === 'name') {
                    comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                } else if (State.foldersSort.method === 'date') {
                    // Use created timestamp from the folder data
                    comparison = (a.created || 0) - (b.created || 0);
                } else if (State.foldersSort.method === 'size') {
                    // Size sorting will need backend support
                    // For now, use 0 as default size
                    comparison = (a.size || 0) - (b.size || 0);
                }
                
                return State.foldersSort.direction === 'asc' ? comparison : -comparison;
            });
        },

        /**
         * Set the sort method and rebuild tree
         * @param {string} method - Sort method ('name', 'date', or 'size')
         */
        setSortMethod(method) {
            if (State.foldersSort.method === method) {
                State.foldersSort.direction = State.foldersSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                State.foldersSort.method = method;
                State.foldersSort.direction = 'asc';
            }
            
            this.updateSortUI();
            this.rebuildTree();
        },

        /**
         * Update the sort UI to reflect current state
         */
        updateSortUI() {
            const sortBtn = document.getElementById('folders-sort-btn');
            const sortIndicator = document.getElementById('folders-sort-indicator');
            const sortDropdown = document.getElementById('folders-sort-dropdown');
            
            if (!sortBtn || !sortIndicator || !sortDropdown) return;
            
            // Update button title
            const fieldNames = {
                name: 'Name',
                date: 'Date Modified',
                size: 'Size'
            };
            sortBtn.title = `Sort by: ${fieldNames[State.foldersSort.method] || 'Name'}`;
            
            // Update direction indicator
            sortIndicator.textContent = State.foldersSort.direction === 'asc' ? '▲' : '▼';
            
            // Update active option in dropdown
            sortDropdown.querySelectorAll('.sort-option').forEach(option => {
                option.classList.toggle('active', option.dataset.sort === State.foldersSort.method);
            });
        },
        
        /**
         * Initialize drag and drop event handlers
         */
        initDragAndDrop() {
            const tree = document.getElementById('folder-tree');
            if (!tree) return;
            
            // Use event delegation on the tree container
            tree.addEventListener('dragstart', this.handleDragStart.bind(this));
            tree.addEventListener('dragover', this.handleDragOver.bind(this));
            tree.addEventListener('dragenter', this.handleDragEnter.bind(this));
            tree.addEventListener('dragleave', this.handleDragLeave.bind(this));
            tree.addEventListener('drop', this.handleDrop.bind(this));
            tree.addEventListener('dragend', this.handleDragEnd.bind(this));
            
            // Add handlers for blank area (root) drop zone
            const scrollArea = document.querySelector('.folders-scroll-area');
            if (scrollArea) {
                scrollArea.addEventListener('dragover', this.handleBlankAreaDragOver.bind(this));
                scrollArea.addEventListener('dragleave', this.handleBlankAreaDragLeave.bind(this));
                scrollArea.addEventListener('drop', this.handleBlankAreaDrop.bind(this));
                
                // Add click handler to deselect folders when clicking blank area
                scrollArea.addEventListener('click', (e) => {
                    // Check if click was on blank area (not on a tree item)
                    if (e.target === scrollArea || e.target.classList.contains('folders-scroll-area')) {
                        // Deselect current folder
                        if (State.selectedTreeItem) {
                            State.selectedTreeItem.classList.remove('selected');
                            State.selectedTreeItem = null;
                            State.currentPath = '';
                        }
                    }
                });
            }
        },
        
        /**
         * Handle drag start event
         * @param {DragEvent} e - Drag event
         */
        handleDragStart(e) {
            // Only handle drag on tree items
            const treeItem = e.target.closest('.tree-item');
            if (!treeItem) return;
            
            const folderPath = treeItem.dataset.path;
            draggingFolder = folderPath;
            
            // Add dragging class for visual feedback
            treeItem.classList.add('dragging');
            
            // Set drag data
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', folderPath);
        },
        
        /**
         * Handle drag over event
         * @param {DragEvent} e - Drag event
         */
        handleDragOver(e) {
            if (!draggingFolder) return;
            
            const treeItem = e.target.closest('.tree-item');
            if (!treeItem) return;
            
            const targetPath = treeItem.dataset.path;
            
            // Validate if this is a valid drop target
            if (this.isValidDropTarget(draggingFolder, targetPath)) {
                e.preventDefault(); // Allow drop
                e.dataTransfer.dropEffect = 'move';
            }
        },
        
        /**
         * Handle drag over event on blank area (for root drop)
         * @param {DragEvent} e - Drag event
         */
        handleBlankAreaDragOver(e) {
            if (!draggingFolder) return;
            
            // Check if we're over the blank area (not over a tree item)
            const treeItem = e.target.closest('.tree-item');
            if (treeItem) return; // Not blank area
            
            // Validate if dropping to root is allowed
            if (this.isValidDropTarget(draggingFolder, '')) {
                e.preventDefault(); // Allow drop
                e.dataTransfer.dropEffect = 'move';
                
                // Add visual feedback to scroll area
                const scrollArea = document.querySelector('.folders-scroll-area');
                if (scrollArea && !scrollArea.classList.contains('drop-zone-active')) {
                    scrollArea.classList.add('drop-zone-active');
                }
            }
        },
        
        /**
         * Handle drag leave event on blank area
         * @param {DragEvent} e - Drag event
         */
        handleBlankAreaDragLeave(e) {
            // Only remove if we're truly leaving the scroll area
            const scrollArea = document.querySelector('.folders-scroll-area');
            if (scrollArea && !scrollArea.contains(e.relatedTarget)) {
                scrollArea.classList.remove('drop-zone-active');
            }
        },
        
        /**
         * Handle drop event on blank area (move to root)
         * @param {DragEvent} e - Drag event
         */
        async handleBlankAreaDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            
            if (!draggingFolder) return;
            
            // Check if we're over the blank area (not over a tree item)
            const treeItem = e.target.closest('.tree-item');
            if (treeItem) return; // Not blank area, let normal handler deal with it
            
            // Remove visual feedback
            const scrollArea = document.querySelector('.folders-scroll-area');
            if (scrollArea) {
                scrollArea.classList.remove('drop-zone-active');
            }
            
            const targetPath = ''; // Root directory
            
            // Validate drop target
            if (!this.isValidDropTarget(draggingFolder, targetPath)) {
                return;
            }
            
            try {
                // Execute the move via API
                const result = await API.moveFolder(draggingFolder, targetPath);
                
                if (result.error) {
                    UIUtils.showStatus(result.error, 'error');
                    return;
                }
                
                // Success - update UI
                UIUtils.showStatus('Folder moved to root successfully', 'success');
                
                // Clear file list since files from old location are no longer valid
                State.currentFiles = [];
                State.currentFile = null;
                State.selectedListItem = null;
                const fileList = document.getElementById('file-list');
                if (fileList) {
                    fileList.innerHTML = '';
                }
                
                // Clear file count display
                const fileCount = document.getElementById('file-count');
                if (fileCount) {
                    fileCount.textContent = '(0)';
                }
                
                // Clear current tree data and expanded folders to force full refresh
                State.treeData = { '': [] };
                State.expandedFolders.clear();
                
                // Reload from server
                await this.loadTree();
                
            } catch (error) {
                console.error('Drop operation failed:', error);
                console.error('Source path:', draggingFolder);
                console.error('Target path:', targetPath);
                UIUtils.showStatus('Error moving folder', 'error');
            }
        },
        
        /**
         * Handle drag enter event
         * @param {DragEvent} e - Drag event
         */
        handleDragEnter(e) {
            if (!draggingFolder) return;
            
            const treeItem = e.target.closest('.tree-item');
            if (!treeItem) return;
            
            const targetPath = treeItem.dataset.path;
            
            // Add visual feedback if valid drop target
            if (this.isValidDropTarget(draggingFolder, targetPath)) {
                treeItem.classList.add('drag-over');
            }
        },
        
        /**
         * Handle drag leave event
         * @param {DragEvent} e - Drag event
         */
        handleDragLeave(e) {
            const treeItem = e.target.closest('.tree-item');
            if (!treeItem) return;
            
            // Only remove class if we're actually leaving the element
            // Check if the related target is not a child of this tree item
            if (!treeItem.contains(e.relatedTarget)) {
                treeItem.classList.remove('drag-over');
            }
        },
        
        /**
         * Handle drop event
         * @param {DragEvent} e - Drag event
         */
        async handleDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            
            if (!draggingFolder) return;
            
            const treeItem = e.target.closest('.tree-item');
            if (!treeItem) return;
            
            const targetPath = treeItem.dataset.path;
            
            // Validate drop target
            if (!this.isValidDropTarget(draggingFolder, targetPath)) {
                return;
            }
            
            // Remove visual feedback
            treeItem.classList.remove('drag-over');
            
            try {
                // Execute the move via API
                const result = await API.moveFolder(draggingFolder, targetPath);
                
                if (result.error) {
                    UIUtils.showStatus(result.error, 'error');
                    return;
                }
                
                // Success - update UI
                UIUtils.showStatus('Folder moved successfully', 'success');
                
                // Clear file list since files from old location are no longer valid
                State.currentFiles = [];
                State.currentFile = null;
                State.selectedListItem = null;
                const fileList = document.getElementById('file-list');
                if (fileList) {
                    fileList.innerHTML = '';
                }
                
                // Clear file count display
                const fileCount = document.getElementById('file-count');
                if (fileCount) {
                    fileCount.textContent = '(0)';
                }
                
                // Clear current tree data and expanded folders to force full refresh
                State.treeData = { '': [] };
                State.expandedFolders.clear();
                
                // Reload from server
                await this.loadTree();
                
            } catch (error) {
                console.error('Drop operation failed:', error);
                console.error('Source path:', draggingFolder);
                console.error('Target path:', targetPath);
                UIUtils.showStatus('Error moving folder', 'error');
            }
        },
        
        /**
         * Handle drag end event
         * @param {DragEvent} e - Drag event
         */
        handleDragEnd(e) {
            // Clean up all drag-related classes
            document.querySelectorAll('.tree-item.dragging').forEach(item => {
                item.classList.remove('dragging');
            });
            document.querySelectorAll('.tree-item.drag-over').forEach(item => {
                item.classList.remove('drag-over');
            });
            
            // Remove blank area visual feedback
            const scrollArea = document.querySelector('.folders-scroll-area');
            if (scrollArea) {
                scrollArea.classList.remove('drop-zone-active');
            }
            
            // Reset drag state
            draggingFolder = null;
        },
        
        /**
         * Validate if a folder can be dropped on a target
         * @param {string} sourcePath - Path of folder being dragged
         * @param {string} targetPath - Path of potential drop target (empty string for root)
         * @returns {boolean} True if drop is valid
         */
        isValidDropTarget(sourcePath, targetPath) {
            // Cannot drop on itself
            if (sourcePath === targetPath) {
                return false;
            }
            
            // Cannot drop on a descendant (would create circular reference)
            if (targetPath && targetPath.startsWith(sourcePath + '/')) {
                return false;
            }
            
            // Handle dropping to root (empty string)
            if (targetPath === '' || targetPath === null || targetPath === undefined) {
                // Check if source is already at root level (no parent folder)
                // A folder is at root if it has no '/' in its path
                const isAlreadyAtRoot = sourcePath.indexOf('/') === -1;
                // Only allow drop to root if folder is NOT already at root (prevent no-op)
                return !isAlreadyAtRoot;
            }
            
            // Cannot drop on current parent (would be a no-op move)
            const sourceParent = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
            if (sourceParent === targetPath) {
                return false;
            }
            
            return true;
        },
        
        /**
         * Start folder rename editing
         * @param {HTMLElement} folderElement - The folder tree item element
         * @param {Object} item - The folder data object
         */
        startFolderRename(folderElement, item) {
            // Prevent concurrent editing
            if (State.editingFolder && State.editingFolder !== folderElement) {
                return;
            }
            
            // Prevent rapid double-clicks from triggering multiple operations
            if (State.isRenamingFolder) {
                return;
            }
            State.isRenamingFolder = true;
            
            // Transition to inline edit state
            if (window.MetadataRemote.Navigation.StateMachine) {
                window.MetadataRemote.Navigation.StateMachine.transition(
                    window.MetadataRemote.Navigation.StateMachine.States.INLINE_EDIT,
                    { element: folderElement, type: 'folder' }
                );
            }
            
            const content = folderElement.querySelector('.tree-item-content');
            const nameSpan = content.querySelector('span:last-child');
            
            // Hide the name span
            nameSpan.style.display = 'none';
            
            // Create edit container
            const editContainer = document.createElement('div');
            editContainer.className = 'tree-rename-edit';
            editContainer.style.display = 'inline-flex';
            editContainer.style.alignItems = 'center';
            editContainer.style.gap = '0.25rem';
            editContainer.style.flex = '1';
            
            // Create input
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'tree-rename-input';
            input.value = item.name;
            input.style.flex = '1';
            input.style.minWidth = '100px';
            input.maxLength = 255; // Add length limit
            
            // Create save button with proper structure for button status
            const saveBtn = document.createElement('button');
            saveBtn.className = 'tree-rename-save tree-rename-btn btn-status';
            saveBtn.innerHTML = '<span class="btn-status-content">✓</span><span class="btn-status-message"></span>';
            saveBtn.title = 'Save folder name';
            
            // Create cancel button
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'tree-rename-cancel tree-rename-btn';
            cancelBtn.innerHTML = '✕'; // Use consistent symbol
            cancelBtn.title = 'Cancel rename';
            
            editContainer.appendChild(input);
            editContainer.appendChild(saveBtn);
            editContainer.appendChild(cancelBtn);
            
            // Insert after the icon
            const icon = content.querySelector('.tree-icon');
            icon.insertAdjacentElement('afterend', editContainer);
            
            // Store editing state
            State.editingFolder = folderElement;
            State.editingFolderData = {
                originalName: item.name,
                path: item.path,
                element: folderElement,
                nameSpan: nameSpan,
                editContainer: editContainer,
                input: input
            };
            
            // Set up event handlers
            const saveFolderName = async () => {
                const newName = input.value.trim();
                if (!newName || newName === item.name) {
                    this.cancelFolderRename();
                    return;
                }
                
                // Comprehensive validation
                const invalidChars = /[<>:"|?*\x00-\x1f]/; // Windows/Unix invalid characters
                if (newName.includes('/') || newName.includes('\\') || invalidChars.test(newName)) {
                    const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
                    if (ButtonStatus) {
                        ButtonStatus.showButtonStatus(saveBtn, 'Invalid name', 'error', 3000);
                    }
                    return;
                }
                
                // Check reserved names (Windows)
                const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 
                                      'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 
                                      'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
                if (reservedNames.includes(newName.toUpperCase())) {
                    const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
                    if (ButtonStatus) {
                        ButtonStatus.showButtonStatus(saveBtn, 'Reserved name', 'error', 3000);
                    }
                    return;
                }
                
                // Disable input during save
                input.disabled = true;
                saveBtn.disabled = true;
                cancelBtn.disabled = true;
                
                // Call API to rename folder
                try {
                    const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
                    if (ButtonStatus) {
                        ButtonStatus.showButtonStatus(saveBtn, '', 'processing');
                    }
                    
                    const result = await API.renameFolder(item.path, newName);
                    
                    if (result.error) {
                        if (ButtonStatus) {
                            ButtonStatus.showButtonStatus(saveBtn, result.error, 'error', 3000);
                        }
                        // Re-enable controls
                        input.disabled = false;
                        saveBtn.disabled = false;
                        cancelBtn.disabled = false;
                        return;
                    }
                    
                    // Update successful - update UI
                    if (ButtonStatus) {
                        ButtonStatus.showButtonStatus(saveBtn, '✓', 'success', 1000);
                    }
                    
                    // Update the item data
                    const oldPath = item.path;
                    item.name = newName;
                    item.path = result.newPath;
                    
                    // Update all UI elements
                    this.updateFolderReferences(oldPath, result.newPath);
                    
                    // Clean up edit UI after brief delay
                    setTimeout(() => {
                        nameSpan.textContent = newName;
                        nameSpan.style.display = '';
                        editContainer.remove();
                        
                        // Clear editing state
                        State.editingFolder = null;
                        State.editingFolderData = null;
                        State.isRenamingFolder = false;
                        
                        // Return to normal state
                        if (window.MetadataRemote.Navigation.StateMachine) {
                            window.MetadataRemote.Navigation.StateMachine.transition(
                                window.MetadataRemote.Navigation.StateMachine.States.NORMAL
                            );
                        }
                    }, 1000);
                    
                } catch (error) {
                    console.error('Error renaming folder:', error);
                    const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
                    if (ButtonStatus) {
                        ButtonStatus.showButtonStatus(saveBtn, 'Network error', 'error', 3000);
                    }
                    // Re-enable controls
                    input.disabled = false;
                    saveBtn.disabled = false;
                    cancelBtn.disabled = false;
                    State.isRenamingFolder = false;
                }
            };
            
            const cancelRename = () => {
                this.cancelFolderRename();
            };
            
            // Handle focus loss
            const handleBlur = (e) => {
                // Check if focus moved to save/cancel buttons
                if (e.relatedTarget === saveBtn || e.relatedTarget === cancelBtn) {
                    return;
                }
                // Otherwise cancel the rename
                setTimeout(() => {
                    if (State.editingFolder === folderElement) {
                        this.cancelFolderRename();
                    }
                }, 200);
            };
            
            // Attach handlers
            saveBtn.onclick = saveFolderName;
            cancelBtn.onclick = cancelRename;
            input.onblur = handleBlur;
            
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveFolderName();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelRename();
                }
            };
            
            // Focus and select input
            input.focus();
            input.select();
        },
        
        /**
         * Cancel folder rename editing
         */
        cancelFolderRename() {
            if (!State.editingFolderData) return;
            
            const { nameSpan, editContainer } = State.editingFolderData;
            
            // Restore original display
            nameSpan.style.display = '';
            editContainer.remove();
            
            // Clear editing state
            State.editingFolder = null;
            State.editingFolderData = null;
            State.isRenamingFolder = false;
            
            // Return to normal state
            if (window.MetadataRemote.Navigation.StateMachine) {
                window.MetadataRemote.Navigation.StateMachine.transition(
                    window.MetadataRemote.Navigation.StateMachine.States.NORMAL
                );
            }
        },
        
        /**
         * Trigger folder move for currently selected folder (called from keyboard shortcut)
         */
        triggerFolderMove() {
            if (!State.selectedTreeItem) {
                return;
            }
            
            const folderPath = State.selectedTreeItem.dataset.path;
            if (!folderPath) {
                return;
            }
            
            // Get folder name from the tree item
            const nameSpan = State.selectedTreeItem.querySelector('.tree-item-content span:last-child');
            const folderName = nameSpan ? nameSpan.textContent : folderPath.split('/').pop();
            
            // Start the move operation
            this.startFolderMove({
                path: folderPath,
                name: folderName
            });
        },
        
        /**
         * Update all folder references after rename
         * @param {string} oldPath - Original folder path
         * @param {string} newPath - New folder path
         */
        updateFolderReferences(oldPath, newPath) {
            // Update tree data keys
            if (State.treeData[oldPath]) {
                State.treeData[newPath] = State.treeData[oldPath];
                delete State.treeData[oldPath];
            }
            
            // Update expanded folders set
            if (State.expandedFolders.has(oldPath)) {
                State.expandedFolders.delete(oldPath);
                State.expandedFolders.add(newPath);
            }
            
            // Update current path if it's affected
            if (State.currentPath === oldPath) {
                State.currentPath = newPath;
            } else if (State.currentPath && State.currentPath.startsWith(oldPath + '/')) {
                State.currentPath = newPath + State.currentPath.substring(oldPath.length);
            }
            
            // Update current file path if affected
            if (State.currentFile && State.currentFile.startsWith(oldPath + '/')) {
                State.currentFile = newPath + State.currentFile.substring(oldPath.length);
            }
            
            // Update all child folder paths in tree data
            Object.keys(State.treeData).forEach(key => {
                if (key.startsWith(oldPath + '/')) {
                    const newKey = newPath + key.substring(oldPath.length);
                    State.treeData[newKey] = State.treeData[key];
                    delete State.treeData[key];
                    
                    // Also update in expanded folders
                    if (State.expandedFolders.has(key)) {
                        State.expandedFolders.delete(key);
                        State.expandedFolders.add(newKey);
                    }
                }
            });
            
            // Update DOM elements
            this.updateDOMPaths(oldPath, newPath);
            
            // Reload files if current folder was affected
            if (State.currentPath === newPath || 
                (State.currentPath && State.currentPath.startsWith(newPath + '/'))) {
                if (loadFilesCallback) {
                    loadFilesCallback(State.currentPath);
                }
            }
        },
        
        /**
         * Update DOM element paths after folder rename
         * @param {string} oldPath - Original folder path
         * @param {string} newPath - New folder path
         */
        updateDOMPaths(oldPath, newPath) {
            // Update the renamed folder's data-path
            const renamedElement = document.querySelector(`[data-path="${oldPath}"]`);
            if (renamedElement) {
                renamedElement.dataset.path = newPath;
            }
            
            // Update all child elements
            document.querySelectorAll(`[data-path^="${oldPath}/"]`).forEach(element => {
                const currentPath = element.dataset.path;
                element.dataset.path = newPath + currentPath.substring(oldPath.length);
            });
        },
        
        /**
         * Start folder move operation - show modal to select destination
         * @param {Object} folderItem - The folder data object to move
         */
        startFolderMove(folderItem) {
            // Store the source folder
            State.movingFolder = {
                path: folderItem.path,
                name: folderItem.name
            };
            
            // Show the move folder modal
            const modal = document.getElementById('move-folder-modal');
            const overlay = document.getElementById('move-folder-overlay');
            const sourceName = document.getElementById('move-folder-source-name');
            const treeContainer = document.getElementById('move-folder-tree');
            
            if (!modal || !overlay || !sourceName || !treeContainer) {
                console.error('Move folder modal elements not found');
                return;
            }
            
            // Set source folder name
            sourceName.textContent = folderItem.name;
            
            // Build the folder tree (excluding source folder and its descendants)
            this.buildMoveFolderTree(treeContainer, folderItem.path);
            
            // Show modal
            overlay.classList.add('active');
            modal.classList.add('active');
            
            // Set up keyboard handlers for the modal
            const handleModalKeydown = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.closeFolderMoveModal();
                    document.removeEventListener('keydown', handleModalKeydown);
                } else if (e.key === 'Enter') {
                    const confirmBtn = document.getElementById('move-folder-confirm-btn');
                    if (confirmBtn && !confirmBtn.disabled) {
                        e.preventDefault();
                        this.executeFolderMove();
                        document.removeEventListener('keydown', handleModalKeydown);
                    }
                }
            };
            
            // Add event listener
            document.addEventListener('keydown', handleModalKeydown);
            
            // Store handler for cleanup
            State.modalKeydownHandler = handleModalKeydown;
            
            // Add overlay click handler
            const handleOverlayClick = (e) => {
                if (e.target === overlay) {
                    this.closeFolderMoveModal();
                    overlay.removeEventListener('click', handleOverlayClick);
                }
            };
            overlay.addEventListener('click', handleOverlayClick);
            State.modalOverlayHandler = handleOverlayClick;
        },
        
        /**
         * Build a folder tree for the move modal
         * @param {HTMLElement} container - Container for the tree
         * @param {string} excludePath - Path to exclude (source folder)
         */
        buildMoveFolderTree(container, excludePath) {
            container.innerHTML = '';
            
            // Add root option
            const rootItem = this.createMoveFolderItem({
                name: '/ (Root)',
                path: '',
                type: 'folder'
            }, excludePath, 0);
            container.appendChild(rootItem);
            
            // Build tree from data
            const items = State.treeData[''] || [];
            this.buildMoveFolderTreeRecursive(container, items, excludePath, 0);
        },
        
        /**
         * Recursively build folder tree for move modal
         * @param {HTMLElement} container - Container element
         * @param {Array} items - Items to render
         * @param {string} excludePath - Path to exclude
         * @param {number} level - Depth level
         */
        buildMoveFolderTreeRecursive(container, items, excludePath, level) {
            items.forEach(item => {
                if (item.type !== 'folder') return;
                
                // Skip the source folder and its descendants
                if (item.path === excludePath || item.path.startsWith(excludePath + '/')) {
                    return;
                }
                
                const folderItem = this.createMoveFolderItem(item, excludePath, level);
                container.appendChild(folderItem);
                
                // If this folder has children and is expanded, show them
                if (State.treeData[item.path]) {
                    this.buildMoveFolderTreeRecursive(container, State.treeData[item.path], excludePath, level + 1);
                }
            });
        },
        
        /**
         * Create a folder item for the move modal
         * @param {Object} item - Folder item data
         * @param {string} excludePath - Path to exclude
         * @param {number} level - Depth level
         * @returns {HTMLElement} Folder item element
         */
        createMoveFolderItem(item, excludePath, level) {
            const div = document.createElement('div');
            div.className = 'move-folder-item';
            div.dataset.path = item.path;
            div.style.paddingLeft = `${level * 1.5 + 0.75}rem`;
            
            const icon = document.createElement('span');
            icon.className = 'move-folder-icon';
            icon.textContent = '📁';
            
            const name = document.createElement('span');
            name.textContent = item.name;
            
            div.appendChild(icon);
            div.appendChild(name);
            
            // Click handler to select this folder as destination
            div.onclick = () => {
                // Remove previous selection
                document.querySelectorAll('.move-folder-item.selected').forEach(el => {
                    el.classList.remove('selected');
                });
                // Select this folder
                div.classList.add('selected');
                
                // Enable the move button
                const moveBtn = document.getElementById('move-folder-confirm-btn');
                if (moveBtn) {
                    moveBtn.disabled = false;
                }
            };
            
            return div;
        },
        
        /**
         * Execute the folder move operation
         */
        async executeFolderMove() {
            const selectedItem = document.querySelector('.move-folder-item.selected');
            if (!selectedItem || !State.movingFolder) {
                return;
            }
            
            const destinationPath = selectedItem.dataset.path;
            const sourcePath = State.movingFolder.path;
            
            // Prevent moving a folder into itself or its descendants
            if (destinationPath.startsWith(sourcePath + '/') || destinationPath === sourcePath) {
                UIUtils.showStatus('Cannot move folder into itself', 'error');
                return;
            }
            
            const confirmBtn = document.getElementById('move-folder-confirm-btn');
            const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
            
            try {
                // Show processing state
                if (ButtonStatus) {
                    ButtonStatus.showButtonStatus(confirmBtn, 'Moving...', 'processing');
                }
                
                const result = await API.moveFolder(sourcePath, destinationPath);
                
                if (result.error) {
                    if (ButtonStatus) {
                        ButtonStatus.showButtonStatus(confirmBtn, result.error, 'error', 3000);
                    }
                    UIUtils.showStatus(result.error, 'error');
                    return;
                }
                
                // Success!
                if (ButtonStatus) {
                    ButtonStatus.showButtonStatus(confirmBtn, 'Moved!', 'success', 1500);
                }
                UIUtils.showStatus('Folder moved successfully', 'success');
                
                // Clear file list since files from old location are no longer valid
                State.currentFiles = [];
                State.currentFile = null;
                State.selectedListItem = null;
                const fileList = document.getElementById('file-list');
                if (fileList) {
                    fileList.innerHTML = '';
                }
                
                // Clear file count display
                const fileCount = document.getElementById('file-count');
                if (fileCount) {
                    fileCount.textContent = '(0)';
                }
                
                // Clear current tree data and expanded folders to force full refresh
                State.treeData = { '': [] };
                State.expandedFolders.clear();
                
                // Reload from server
                await this.loadTree();
                
                // Close modal after brief delay
                setTimeout(() => {
                    this.closeFolderMoveModal();
                }, 1500);
                
            } catch (error) {
                console.error('Error moving folder:', error);
                console.error('Source path:', sourcePath);
                console.error('Destination path:', destinationPath);
                if (ButtonStatus) {
                    ButtonStatus.showButtonStatus(confirmBtn, 'Network error', 'error', 3000);
                }
                UIUtils.showStatus('Error moving folder', 'error');
            }
        },
        
        /**
         * Close the folder move modal
         */
        closeFolderMoveModal() {
            const modal = document.getElementById('move-folder-modal');
            const overlay = document.getElementById('move-folder-overlay');
            
            if (modal && overlay) {
                overlay.classList.remove('active');
                modal.classList.remove('active');
            }
            
            // Clean up event listeners
            if (State.modalKeydownHandler) {
                document.removeEventListener('keydown', State.modalKeydownHandler);
                State.modalKeydownHandler = null;
            }
            if (State.modalOverlayHandler) {
                overlay.removeEventListener('click', State.modalOverlayHandler);
                State.modalOverlayHandler = null;
            }
            
            // Clear state
            State.movingFolder = null;
            
            // Reset button
            const confirmBtn = document.getElementById('move-folder-confirm-btn');
            if (confirmBtn) {
                confirmBtn.disabled = true;
            }
        },
        
        /**
         * Show dialog to create a new folder
         */
        showCreateFolderDialog() {
            // Get parent path (currently selected folder, or root if none selected)
            const parentPath = State.currentPath || '';
            const parentName = parentPath ? parentPath.split('/').pop() : 'Root';
            
            // Prompt for folder name with clear indication of parent
            const folderName = prompt(`Create new folder in "${parentName}":\n\nEnter folder name:`);
            if (!folderName || folderName.trim() === '') return;
            
            // Call API to create folder
            this.createFolder(parentPath, folderName.trim());
        },
        
        /**
         * Create a new folder
         * @param {string} parentPath - Parent directory path
         * @param {string} folderName - Name of new folder
         */
        async createFolder(parentPath, folderName) {
            try {
                const result = await API.createFolder(parentPath, folderName);
                
                if (result.error) {
                    UIUtils.showStatus(result.error, 'error');
                    return;
                }
                
                // Success - reload tree
                State.treeData = { '': [] };
                State.expandedFolders.clear();
                await this.loadTree();
                
                UIUtils.showStatus('Folder created successfully', 'success');
            } catch (error) {
                console.error('Create folder failed:', error);
                UIUtils.showStatus('Failed to create folder', 'error');
            }
        },
        
        /**
         * Show confirmation dialog to delete selected folder
         */
        showDeleteFolderDialog() {
            // Check if a folder is selected
            if (!State.selectedTreeItem) {
                UIUtils.showStatus('Please select a folder to delete', 'warning');
                return;
            }
            
            const folderPath = State.selectedTreeItem.dataset.path;
            const folderName = folderPath.split('/').pop() || folderPath;
            
            // Confirm deletion
            if (!confirm(`Delete folder "${folderName}"?\n\nThis will delete the folder and all its contents.`)) {
                return;
            }
            
            this.deleteFolder(folderPath);
        },
        
        /**
         * Delete a folder
         * @param {string} folderPath - Path of folder to delete
         */
        async deleteFolder(folderPath) {
            try {
                // Try without force first
                let result = await API.deleteFolder(folderPath, false);
                
                // If folder not empty, ask for confirmation to force delete
                if (result.error && result.error.includes('not empty')) {
                    const message = result.error + '\n\nDelete anyway?';
                    if (!confirm(message)) return;
                    
                    result = await API.deleteFolder(folderPath, true);
                }
                
                if (result.error) {
                    UIUtils.showStatus(result.error, 'error');
                    return;
                }
                
                // Success - clear selection and reload tree
                State.selectedTreeItem = null;
                State.currentPath = '';
                State.currentFile = null;
                State.currentFiles = [];
                State.treeData = { '': [] };
                State.expandedFolders.clear();
                
                // Clear file list UI
                const fileList = document.getElementById('file-list');
                if (fileList) {
                    fileList.innerHTML = '';
                }
                
                // Clear file count display
                const fileCount = document.getElementById('file-count');
                if (fileCount) {
                    fileCount.textContent = '(0)';
                }
                
                await this.loadTree();
                
                UIUtils.showStatus('Folder deleted successfully', 'success');
            } catch (error) {
                console.error('Delete folder failed:', error);
                UIUtils.showStatus('Failed to delete folder', 'error');
            }
        }
    };
})();
