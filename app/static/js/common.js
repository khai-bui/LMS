document.addEventListener('DOMContentLoaded', () => {
    const loggedInUser = JSON.parse(
        sessionStorage.getItem('loggedInUser')
    );

    const token = sessionStorage.getItem('accessToken');

    const MOCK_EMAIL_DATA = {
        manager: 'admin.mgr@lms.vn',
        tc: 'tuvan.a@lms.vn',
        cs: 'chamsoc.hv@lms.vn',
        lec: 'giangvien.b@lms.vn',
        student: 'hocvien.c@lms.vn'
    };

    // =====================================================
    // KIỂM TRA ĐĂNG NHẬP
    // =====================================================

    if (!loggedInUser || !token) {
        sessionStorage.removeItem('loggedInUser');
        sessionStorage.removeItem('accessToken');

        window.location.href = '/';
        return;
    }

    const App = {

        DOM: {
            contentArea: document.querySelector('.content-area')
        },

        // =====================================================
        // HELPERS
        // =====================================================

        Helpers: {

            getRoleDisplay(role) {
                const map = {
                    lec: 'Giảng viên',
                    tc: 'Tư vấn',
                    cs: 'Chăm sóc HV',
                    manager: 'Quản lý',
                    student: 'Học viên',
                    all: 'Tất cả'
                };

                return map[role] || role || '';
            },

            normalizeRole(role) {
                const value = String(role || '')
                    .trim()
                    .toLowerCase();

                const map = {
                    lecturer: 'lec',
                    lec: 'lec',

                    'teacher coordinator': 'tc',
                    teacher_coordinator: 'tc',
                    tc: 'tc',

                    'customer support': 'cs',
                    customer_support: 'cs',
                    cs: 'cs',

                    manager: 'manager',
                    student: 'student'
                };

                return map[value] || value;
            }
        },

        // =====================================================
        // INIT
        // =====================================================

        init() {
            /*
             * KHÔNG loadPartial() nữa.
             *
             * sidebar.html và header.html phải được include
             * trực tiếp trong template bằng Jinja:
             *
             * {% include "partials/sidebar.html" %}
             * {% include "partials/header.html" %}
             */

            this.setupUI();
            this.bindEvents();
            this.ProfileModal.init(this.Helpers);
        },

        // =====================================================
        // SETUP UI
        // =====================================================

        setupUI() {

            const userFullname =
                document.getElementById('user-fullname');

            const displayName =
                loggedInUser.fullName ||
                loggedInUser.user_name ||
                loggedInUser.username ||
                loggedInUser.name ||
                'User';

            if (userFullname) {
                userFullname.textContent = displayName;
            }


            // -----------------------------
            // ROLE
            // -----------------------------

            const role = this.Helpers.normalizeRole(
                loggedInUser.role ||
                loggedInUser.user_role ||
                loggedInUser.role_name
            );


            // -----------------------------
            // ẨN / HIỆN SIDEBAR THEO ROLE
            // -----------------------------

            document
                .querySelectorAll('.sidebar-menu li[data-role]')
                .forEach(item => {

                    const roles = String(
                        item.dataset.role || ''
                    )
                        .split(/\s+/)
                        .filter(Boolean);

                    const allowed =
                        roles.includes('all') ||
                        roles.includes(role);

                    item.style.display =
                        allowed ? '' : 'none';

                    if (!allowed) {
                        item.classList.remove('active');
                    }
                });


            // Nếu menu active hiện tại bị ẩn
            // thì chọn menu đầu tiên có thể hiển thị

            const visibleActive =
                Array.from(
                    document.querySelectorAll(
                        '.sidebar-menu li.active'
                    )
                )
                .find(item => item.style.display !== 'none');

            if (!visibleActive) {

                const firstVisible =
                    Array.from(
                        document.querySelectorAll(
                            '.sidebar-menu li[data-role]'
                        )
                    )
                    .find(
                        item =>
                            item.style.display !== 'none'
                    );

                if (firstVisible) {
                    firstVisible.classList.add('active');
                }
            }
        },

        // =====================================================
        // EVENTS
        // =====================================================

        bindEvents() {

            const sidebarMenu =
                document.querySelector('.sidebar-menu');

            const logoutBtn =
                document.getElementById('logout-btn');

            const userFullnameElement =
                document.getElementById(
                    'user-fullname'
                );


            // -----------------------------
            // PROFILE
            // -----------------------------

            if (userFullnameElement) {

                userFullnameElement.style.cursor =
                    'pointer';

                userFullnameElement.addEventListener(
                    'click',
                    e => {

                        e.preventDefault();

                        const user =
                            JSON.parse(
                                sessionStorage.getItem(
                                    'loggedInUser'
                                )
                            );

                        if (user) {
                            this.ProfileModal.open(user);
                        }
                    }
                );
            }


            // -----------------------------
            // SIDEBAR NAVIGATION
            // -----------------------------

            if (sidebarMenu) {

                sidebarMenu.addEventListener(
                    'click',
                    e => {

                        const link =
                            e.target.closest(
                                'a[data-target]'
                            );

                        if (!link) {
                            return;
                        }

                        e.preventDefault();

                        const targetId =
                            link.dataset.target;

                        if (!targetId) {
                            return;
                        }

                        const targetSection =
                            document.getElementById(
                                targetId
                            );

                        if (!targetSection) {

                            console.warn(
                                `Không tìm thấy section #${targetId}`
                            );

                            return;
                        }


                        // Ẩn toàn bộ section

                        document
                            .querySelectorAll(
                                '.content-section'
                            )
                            .forEach(section => {

                                section.classList.remove(
                                    'active'
                                );
                            });


                        // Hiện section cần chọn

                        targetSection.classList.add(
                            'active'
                        );


                        // Cập nhật active menu

                        sidebarMenu
                            .querySelectorAll('li')
                            .forEach(li => {

                                li.classList.remove(
                                    'active'
                                );
                            });

                        const currentLi =
                            link.closest('li');

                        if (currentLi) {
                            currentLi.classList.add(
                                'active'
                            );
                        }
                    }
                );
            }


            // -----------------------------
            // LOGOUT
            // -----------------------------

            if (logoutBtn) {

                logoutBtn.addEventListener(
                    'click',
                    e => {

                        e.preventDefault();

                        sessionStorage.removeItem(
                            'loggedInUser'
                        );

                        sessionStorage.removeItem(
                            'accessToken'
                        );


                        // cleanup nếu trước đây có dùng localStorage

                        localStorage.removeItem(
                            'access_token'
                        );

                        localStorage.removeItem(
                            'user_id'
                        );

                        localStorage.removeItem(
                            'user_name'
                        );

                        localStorage.removeItem(
                            'user_role'
                        );


                        window.location.href = '/';
                    }
                );
            }
        },


        // =====================================================
        // PROFILE MODAL
        // =====================================================

        ProfileModal: {

            DOM: {},

            Helpers: null,


            init(Helpers) {

                this.Helpers = Helpers;

                this.DOM.overlay =
                    document.getElementById(
                        'profile-modal-overlay'
                    );

                // Không phải page nào cũng có profile modal
                if (!this.DOM.overlay) {
                    return;
                }


                this.DOM.closeBtn =
                    document.getElementById(
                        'close-profile-modal-btn'
                    );

                this.DOM.cancelBtn =
                    document.getElementById(
                        'cancel-profile-btn'
                    );


                this.DOM.usernameDisplay =
                    document.getElementById(
                        'profile-username'
                    );

                this.DOM.emailDisplay =
                    document.getElementById(
                        'profile-email'
                    );


                this.DOM.infoDisplay =
                    document.getElementById(
                        'profile-info-display'
                    );

                this.DOM.editForm =
                    document.getElementById(
                        'profile-edit-form'
                    );


                this.bindEvents();
            },


            bindEvents() {

                if (this.DOM.closeBtn) {

                    this.DOM.closeBtn.addEventListener(
                        'click',
                        () => this.close()
                    );
                }


                if (this.DOM.cancelBtn) {

                    this.DOM.cancelBtn.addEventListener(
                        'click',
                        () => this.close()
                    );
                }


                if (this.DOM.overlay) {

                    this.DOM.overlay.addEventListener(
                        'click',
                        e => {

                            if (
                                e.target ===
                                this.DOM.overlay
                            ) {
                                this.close();
                            }
                        }
                    );
                }
            },


            // =================================================
            // GET USER INFO
            // =================================================

            async fetchUserInfo(userId) {

                const token =
                    sessionStorage.getItem(
                        'accessToken'
                    );

                if (!token || !userId) {
                    return null;
                }


                try {

                    const response =
                        await fetch(
                            `/auth/user/${userId}`,
                            {
                                method: 'GET',

                                headers: {
                                    Authorization:
                                        `Bearer ${token}`
                                }
                            }
                        );


                    if (!response.ok) {

                        throw new Error(
                            `HTTP ${response.status}`
                        );
                    }


                    return await response.json();


                } catch (error) {

                    console.error(
                        'Lỗi khi tải thông tin người dùng:',
                        error
                    );

                    return null;
                }
            },


            // =================================================
            // OPEN PROFILE
            // =================================================

            async open(user) {

                if (!this.DOM.overlay) {
                    return;
                }


                const userId =
                    user.id ||
                    user.user_id;


                const roleKey =
                    this.Helpers.normalizeRole(
                        user.role ||
                        user.user_role
                    );


                const apiData =
                    await this.fetchUserInfo(
                        userId
                    );


                let username =
                    user.username ||
                    user.fullName ||
                    user.user_name ||
                    user.name ||
                    'User';


                let email =
                    MOCK_EMAIL_DATA[roleKey] ||
                    'contact@lms.edu';


                if (apiData) {

                    username =
                        apiData.username ||
                        username;

                    email =
                        apiData.email ||
                        email;
                }


                if (
                    this.DOM.usernameDisplay
                ) {

                    this.DOM.usernameDisplay.textContent =
                        username;
                }


                if (
                    this.DOM.emailDisplay
                ) {

                    this.DOM.emailDisplay.textContent =
                        email;
                }


                this.setModeViewOnly();


                this.DOM.overlay.classList.remove(
                    'hidden'
                );
            },


            // =================================================
            // CLOSE
            // =================================================

            close() {

                if (this.DOM.overlay) {

                    this.DOM.overlay.classList.add(
                        'hidden'
                    );
                }
            },


            // =================================================
            // VIEW ONLY
            // =================================================

            setModeViewOnly() {

                if (this.DOM.infoDisplay) {

                    this.DOM.infoDisplay.classList.remove(
                        'hidden'
                    );
                }


                if (this.DOM.editForm) {

                    this.DOM.editForm.classList.add(
                        'hidden'
                    );
                }


                if (this.DOM.cancelBtn) {

                    this.DOM.cancelBtn.textContent =
                        'Đóng';
                }
            }
        }
    };


    App.init();
});