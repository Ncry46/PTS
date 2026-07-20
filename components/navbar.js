// 💡 จำลองข้อมูลผู้ใช้: เปลี่ยนค่าที่ role เพื่อทดสอบดูความเปลี่ยนแปลง
// ค่าที่เป็นไปได้: null (ยังไม่ล็อกอิน), 'student' (นักเรียน), 'admin' (แอดมิน)


// ฟังก์ชันยิงไปถามข้อมูลสิทธิ์จริงจากหลังบ้าน (เชื่อมฐานข้อมูล 100%)
async function checkUserAndRenderNavbar() {
    const container = document.getElementById('app-navbar');
    if (!container) return;

    try {
        // 🌟 1. เติม credentials: 'include' เพื่อให้ Session ทำงานข้ามหน้าเพจได้ถูกต้อง
        const response = await fetch('/api/users/me', { credentials: 'include' });
        const status = await response.json();

        // -----------------------------------------------------------------
        // 1. เคสยังไม่ได้เข้าสู่ระบบ (Guest Mode -> โชว์ Mega Menu ตัวเต็มของคุณ)
        // -----------------------------------------------------------------
        if (!status.loggedIn) {
            container.innerHTML = `
                <nav class="fixed top-0 left-0 right-0 z-50 bg-white border-b border-outline-variant/30 shadow-sm">
                    <div class="max-w-container-max mx-auto px-margin-mobile md:px-lg h-16 flex items-center justify-between">
                        <div class="flex items-center">
                            <div class="flex items-center gap-sm">
                                <img alt="PA Logo" class="h-10 w-auto object-contain" src="https://lh3.googleusercontent.com/aida-public/AB6AXuABTNhK77NiL0IuFIQlI6OT3Vifm8qP13KVh2E7ow7C1nBZBzvCmxbfbPcqp_ufJqTB-yyShP5xCpLknrMb_L-Giu18pK_I31kIyaQ_R7QyIYjEwf6o5aRyjEY_AdnfLq2rmWtA8WnFI9-AaODwblGI-IcbELscflTPE3ViIRI0pz8sPdppAL4lmeCdpzCdbWVJVt8CsBOnK5aNpm5LSEzvcUIMq56MlbLb0noVVSeb7AcP1xu4117jog">
                            </div>
                            <div class="hidden lg:flex items-center gap-x-8 ml-lg whitespace-nowrap h-16">
                                <a class="font-body-md text-body-md text-primary font-bold border-b-2 border-primary pb-1 flex items-center h-full" href="Home.html">หน้าแรก</a>
                                 <div class="group relative h-full flex items-center">
                                    <button class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors flex items-center h-full">
                                        หลักสูตร <span class="material-symbols-outlined text-[18px]">expand_more</span>
                                    </button>
                                    <div class="mega-menu absolute top-full left-0 w-[480px] bg-white shadow-xl rounded-b-xl border border-outline-variant/30 overflow-hidden hidden group-hover:block z-50 ">
                                <div class="p-md grid grid-cols-1 gap-base">
                                    
                                    <button data-mega-filter="Online" class="flex items-start text-left gap-md p-sm hover:bg-surface-container-low rounded-lg transition-colors group/item w-full cursor-pointer">
                                        <div class="w-10 h-10 rounded-full bg-primary-fixed-dim flex items-center justify-center text-primary shrink-0"><span class="material-symbols-outlined">laptop_mac</span></div>
                                        <div>
                                            <h4 class="font-label-md text-on-surface group-hover/item:text-primary">Online</h4>
                                            <p class="text-body-sm text-on-surface-variant">เรียนผ่านเว็บไซต์ เรียนได้ทุกที่ ทุกเวลา</p>
                                        </div>
                                    </button>

                                    <button data-mega-filter="Onsite" class="flex items-start text-left gap-md p-sm hover:bg-surface-container-low rounded-lg transition-colors group/item w-full cursor-pointer">
                                        <div class="w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center text-secondary shrink-0"><span class="material-symbols-outlined">location_on</span></div>
                                        <div>
                                            <h4 class="font-label-md text-on-surface group-hover/item:text-primary">Onsite</h4>
                                            <p class="text-body-sm text-on-surface-variant">เรียนที่ PTS Academy พร้อมเช็กอินผ่าน QR Code</p>
                                        </div>
                                    </button>

                                    <button data-mega-filter="Hybrid" class="flex items-start text-left gap-md p-sm hover:bg-surface-container-low rounded-lg transition-colors group/item w-full cursor-pointer">
                                        <div class="w-10 h-10 rounded-full bg-tertiary-fixed flex items-center justify-center text-tertiary shrink-0"><span class="material-symbols-outlined">devices</span></div>
                                        <div>
                                            <h4 class="font-label-md text-on-surface group-hover/item:text-primary">Hybrid</h4>
                                            <p class="text-body-sm text-on-surface-variant">เรียนทั้งออนไลน์และออนไซต์ในหลักสูตรเดียว</p>
                                        </div>
                                    </button>

                                </div>
                                        <div class="bg-surface-container-low p-md border-t border-outline-variant/30">
                                            <a href="Courses.html" class="w-full bg-primary text-white py-sm rounded-full text-label-md font-medium hover:brightness-110 transition-all flex items-center justify-center cursor-pointer">ดูหลักสูตรทั้งหมด</a>
                                        </div>
                                    </div>
                                </div>

                                <a class="text-label-md font-label-md text-on-surface-variant hover:text-primary transition-colors flex items-center h-full" href="Community.html">Community</a>
                            </div>
                        </div>
                        
                        <div class="flex items-center gap-md">
                            <div class="hidden md:flex items-center gap-sm">
                                <a class="px-4 py-2 text-label-md font-label-md text-on-surface-variant hover:text-primary transition-colors border border-outline-variant rounded-full" href="Login.html">เข้าสู่ระบบ</a>
                                <a class="px-6 py-2 bg-primary text-white rounded-full text-label-md font-label-md hover:brightness-110 transition-all ring-2 ring-primary/20" href="Register.html">สมัครสมาชิก</a>
                            </div>
                            <button type="button" id="mobile-menu-btn" class="md:hidden w-10 h-10 flex items-center justify-center text-on-surface-variant"><span class="material-symbols-outlined">menu</span></button>
                        </div>
                        <div id="mobile-menu" class="hidden md:hidden border-t border-outline-variant/30 bg-white px-4 py-3 space-y-2">
                            <a class="block py-2" href="Home.html">หน้าแรก</a>
                            <a class="block py-2" href="Courses.html">หลักสูตร</a>
                            <a class="block py-2" href="Community.html">คอมมูนิตี้</a>
                            <a class="block py-2" href="Login.html">เข้าสู่ระบบ</a>
                            <a class="block py-2 font-bold text-primary" href="Register.html">สมัครสมาชิก</a>
                        </div>
                    </div>
                </nav>
            `;
            setTimeout(() => {
                const btn = document.getElementById('mobile-menu-btn');
                const menu = document.getElementById('mobile-menu');
                if (btn && menu) btn.onclick = () => menu.classList.toggle('hidden');
            }, 0);
            return;
        }

        // ดึงข้อมูลผู้ใช้จริงจาก SQL Server
        const currentUser = status.user;
        
        // 🌟 2. ล้างปัญหาตัวพิมพ์เล็ก-ใหญ่ดึงค่า Role จาก SQL Server ให้ปลอดภัยที่สุด
        const userRole = (currentUser?.role || currentUser?.Role || '').toLowerCase();

        // -----------------------------------------------------------------
        // 2. เคสนักเรียน (Student) -> แสดงหน้าตาโปรไฟล์ คุณ ปลาย ดีไซน์ล่าสุดของคุณ
        // -----------------------------------------------------------------
        if (userRole === 'student') {
            container.innerHTML = `
                <nav class="fixed top-0 left-0 right-0 z-50 bg-white border-b border-outline-variant/30 shadow-sm">
                    <div class="max-w-container-max mx-auto px-margin-mobile md:px-lg h-16 flex items-center justify-between">
                        <div class="flex items-center">
                            <div class="flex items-center gap-sm">
                                <img alt="Personal Assistant Academy Logo" class="h-10 w-auto object-contain" src="https://lh3.googleusercontent.com/aida-public/AB6AXuABTNhK77NiL0IuFIQlI6OT3Vifm8qP13KVh2E7ow7C1nBZBzvCmxbfbPcqp_ufJqTB-yyShP5xCpLknrMb_L-Giu18pK_I31kIyaQ_R7QyIYjEwf6o5aRyjEY_AdnfLq2rmWtA8WnFI9-AaODwblGI-IcbELscflTPE3ViIRI0pz8sPdppAL4lmeCdpzCdbWVJVt8CsBOnK5aNpm5LSEzvcUIMq56MlbLb0noVVSeb7AcP1xu4117jog">
                            </div>
                            <div class="hidden lg:flex items-center gap-x-8 ml-lg whitespace-nowrap h-16">
                                <a class="font-body-md text-body-md text-primary font-bold border-b-2 border-primary pb-1 flex items-center h-full" href="Home.html">หน้าแรก</a>
                                 <div class="group relative h-full flex items-center">
                                    <button class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors flex items-center h-full">
                                        หลักสูตร <span class="material-symbols-outlined text-[18px]">expand_more</span>
                                    </button>
                                    <div class="mega-menu absolute top-full left-0 w-[480px] bg-white shadow-xl rounded-b-xl border border-outline-variant/30 overflow-hidden hidden group-hover:block z-50 ">
                                <div class="p-md grid grid-cols-1 gap-base">
                                    
                                    <button data-mega-filter="Online" class="flex items-start text-left gap-md p-sm hover:bg-surface-container-low rounded-lg transition-colors group/item w-full cursor-pointer">
                                        <div class="w-10 h-10 rounded-full bg-primary-fixed-dim flex items-center justify-center text-primary shrink-0"><span class="material-symbols-outlined">laptop_mac</span></div>
                                        <div>
                                            <h4 class="font-label-md text-on-surface group-hover/item:text-primary">Online</h4>
                                            <p class="text-body-sm text-on-surface-variant">เรียนผ่านเว็บไซต์ เรียนได้ทุกที่ ทุกเวลา</p>
                                        </div>
                                    </button>

                                    <button data-mega-filter="Onsite" class="flex items-start text-left gap-md p-sm hover:bg-surface-container-low rounded-lg transition-colors group/item w-full cursor-pointer">
                                        <div class="w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center text-secondary shrink-0"><span class="material-symbols-outlined">location_on</span></div>
                                        <div>
                                            <h4 class="font-label-md text-on-surface group-hover/item:text-primary">Onsite</h4>
                                            <p class="text-body-sm text-on-surface-variant">เรียนที่ PTS Academy พร้อมเช็กอินผ่าน QR Code</p>
                                        </div>
                                    </button>

                                    <button data-mega-filter="Hybrid" class="flex items-start text-left gap-md p-sm hover:bg-surface-container-low rounded-lg transition-colors group/item w-full cursor-pointer">
                                        <div class="w-10 h-10 rounded-full bg-tertiary-fixed flex items-center justify-center text-tertiary shrink-0"><span class="material-symbols-outlined">devices</span></div>
                                        <div>
                                            <h4 class="font-label-md text-on-surface group-hover/item:text-primary">Hybrid</h4>
                                            <p class="text-body-sm text-on-surface-variant">เรียนทั้งออนไลน์และออนไซต์ในหลักสูตรเดียว</p>
                                        </div>
                                    </button>

                                </div>
                                        <div class="bg-surface-container-low p-md border-t border-outline-variant/30">
                                            <a href="Courses.html" class="w-full bg-primary text-white py-sm rounded-full text-label-md font-medium hover:brightness-110 transition-all flex items-center justify-center cursor-pointer">ดูหลักสูตรทั้งหมด</a>
                                        </div>
                                    </div>
                                </div>
                                <a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors flex items-center h-full" href="Community.html">คอมมูนิตี้</a>
                                <a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors flex items-center h-full" href="Liked.html">ถูกใจ</a>
                                <a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors flex items-center h-full" href="Favorites.html">คอร์สโปรด</a>
                                <a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors flex items-center h-full" href="DashbordU.html">แดชบอร์ด</a>
                            </div>
                        </div>

                        <div class="flex items-center gap-base">
                            <button class="material-symbols-outlined p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-all active:scale-95">notifications</button>
                            <a href="Notifications.html" class="material-symbols-outlined p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-all">notifications</a>
                            <div class="relative">
                                <button type="button" class="flex items-center gap-sm pl-base group" onclick="this.nextElementSibling.classList.toggle('hidden')">
                                    <div class="text-right hidden sm:block">
                                        <p class="font-label-md text-label-md text-on-surface font-bold">${currentUser.name || 'คุณผู้ใช้'}</p>
                                        <p class="text-[10px] text-primary uppercase tracking-wider font-semibold">Student</p>
                                    </div>
                                    <img class="w-10 h-10 rounded-full object-cover border-2 border-primary/20" src="${currentUser.Url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentUser.name || 'P') + '&background=F8BBD0&color=880E4F&size=128'}">
                                </button>
                                <div class="hidden absolute right-0 top-full mt-2 w-48 bg-white border rounded-xl shadow-lg z-50 overflow-hidden">
                                    <a class="block px-4 py-2 hover:bg-surface-container-low text-sm" href="DashbordU.html">แดชบอร์ด</a>
                                    <a class="block px-4 py-2 hover:bg-surface-container-low text-sm" href="Settings.html">ตั้งค่า</a>
                                    <a class="block px-4 py-2 hover:bg-surface-container-low text-sm" href="Liked.html">โพสต์ถูกใจ</a>
                                    <a class="block px-4 py-2 hover:bg-surface-container-low text-sm" href="Favorites.html">คอร์สโปรด</a>
                                    <button type="button" class="w-full text-left px-4 py-2 hover:bg-red-50 text-sm text-error" onclick="logout()">ออกจากระบบ</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </nav>
            `;
        } 
        // -----------------------------------------------------------------
        // 3. เคสแอดมิน (Admin)
        // -----------------------------------------------------------------
        else if (userRole === 'admin') {
            // 📍 ปรับเปลี่ยนโค้ดเมนูย่อยใน components/navbar.js เป็นเวอร์ชันปุ่มกรอง (Filter)
            container.innerHTML = `
                <nav class="fixed top-0 left-0 right-0 z-50 bg-white border-b border-outline-variant/30 shadow-sm">
                    <div class="max-w-container-max mx-auto px-margin-mobile md:px-lg h-16 flex items-center justify-between">
                        <div class="flex items-center">
                            <div class="flex items-center gap-sm">
                                <img alt="Personal Assistant Academy Logo" class="h-10 w-auto object-contain" src="https://lh3.googleusercontent.com/aida-public/AB6AXuABTNhK77NiL0IuFIQlI6OT3Vifm8qP13KVh2E7ow7C1nBZBzvCmxbfbPcqp_ufJqTB-yyShP5xCpLknrMb_L-Giu18pK_I31kIyaQ_R7QyIYjEwf6o5aRyjEY_AdnfLq2rmWtA8WnFI9-AaODwblGI-IcbELscflTPE3ViIRI0pz8sPdppAL4lmeCdpzCdbWVJVt8CsBOnK5aNpm5LSEzvcUIMq56MlbLb0noVVSeb7AcP1xu4117jog">
                            </div>
                            <div class="hidden lg:flex items-center gap-x-8 ml-lg whitespace-nowrap h-16">
                                <a class="font-body-md text-body-md text-primary font-bold border-b-2 border-primary pb-1 flex items-center h-full" href="Home.html">หน้าแรก</a>
                                 <div class="group relative h-full flex items-center">
                                    <button class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors flex items-center h-full">
                                        หลักสูตร <span class="material-symbols-outlined text-[18px]">expand_more</span>
                                    </button>
                                    <div class="mega-menu absolute top-full left-0 w-[480px] bg-white shadow-xl rounded-b-xl border border-outline-variant/30 overflow-hidden hidden group-hover:block z-50 ">
                                <div class="p-md grid grid-cols-1 gap-base">
                                    
                                    <button data-mega-filter="Online" class="flex items-start text-left gap-md p-sm hover:bg-surface-container-low rounded-lg transition-colors group/item w-full cursor-pointer">
                                        <div class="w-10 h-10 rounded-full bg-primary-fixed-dim flex items-center justify-center text-primary shrink-0"><span class="material-symbols-outlined">laptop_mac</span></div>
                                        <div>
                                            <h4 class="font-label-md text-on-surface group-hover/item:text-primary">Online</h4>
                                            <p class="text-body-sm text-on-surface-variant">เรียนผ่านเว็บไซต์ เรียนได้ทุกที่ ทุกเวลา</p>
                                        </div>
                                    </button>

                                    <button data-mega-filter="Onsite" class="flex items-start text-left gap-md p-sm hover:bg-surface-container-low rounded-lg transition-colors group/item w-full cursor-pointer">
                                        <div class="w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center text-secondary shrink-0"><span class="material-symbols-outlined">location_on</span></div>
                                        <div>
                                            <h4 class="font-label-md text-on-surface group-hover/item:text-primary">Onsite</h4>
                                            <p class="text-body-sm text-on-surface-variant">เรียนที่ PTS Academy พร้อมเช็กอินผ่าน QR Code</p>
                                        </div>
                                    </button>

                                    <button data-mega-filter="Hybrid" class="flex items-start text-left gap-md p-sm hover:bg-surface-container-low rounded-lg transition-colors group/item w-full cursor-pointer">
                                        <div class="w-10 h-10 rounded-full bg-tertiary-fixed flex items-center justify-center text-tertiary shrink-0"><span class="material-symbols-outlined">devices</span></div>
                                        <div>
                                            <h4 class="font-label-md text-on-surface group-hover/item:text-primary">Hybrid</h4>
                                            <p class="text-body-sm text-on-surface-variant">เรียนทั้งออนไลน์และออนไซต์ในหลักสูตรเดียว</p>
                                        </div>
                                    </button>

                                </div>
                                        <div class="bg-surface-container-low p-md border-t border-outline-variant/30">
                                            <a href="Courses.html" class="w-full bg-primary text-white py-sm rounded-full text-label-md font-medium hover:brightness-110 transition-all flex items-center justify-center cursor-pointer">ดูหลักสูตรทั้งหมด</a>
                                        </div>
                                    </div>
                                </div>
                                <a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors flex items-center h-full" href="Community.html">คอมมูนิตี้</a>
                                <a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors flex items-center h-full" href="Liked.html">ถูกใจ</a>
                                <a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors flex items-center h-full" href="Favorites.html">คอร์สโปรด</a>
                                <a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors flex items-center h-full" href="DashbordU.html">แดชบอร์ด</a>
                                <a class="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors flex items-center h-full" href="Admin.html">Admin</a>
                            </div>
                        </div>

                        <div class="flex items-center gap-base">
                            <a href="Notifications.html" class="material-symbols-outlined p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-all">notifications</a>
                            <div class="relative">
                                <button type="button" class="flex items-center gap-sm pl-base" onclick="this.nextElementSibling.classList.toggle('hidden')">
                                    <div class="text-right hidden sm:block">
                                        <p class="font-label-md text-label-md text-on-surface font-bold">${currentUser.name || 'คุณผู้ใช้งาน'}</p>
                                        <p class="text-[10px] text-primary uppercase tracking-wider font-semibold">Admin</p>
                                    </div>
                                    <img class="w-10 h-10 rounded-full object-cover border-2 border-primary/20" src="${currentUser.Url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentUser.name || 'P') + '&background=F8BBD0&color=880E4F&size=128'}">
                                </button>
                                <div class="hidden absolute right-0 top-full mt-2 w-48 bg-white border rounded-xl shadow-lg z-50 overflow-hidden">
                                    <a class="block px-4 py-2 hover:bg-surface-container-low text-sm" href="Admin.html">Admin</a>
                                    <a class="block px-4 py-2 hover:bg-surface-container-low text-sm" href="Settings.html">ตั้งค่า</a>
                                    <button type="button" class="w-full text-left px-4 py-2 hover:bg-red-50 text-sm text-error" onclick="logout()">ออกจากระบบ</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </nav>
            `;
        }
    } catch (error) {
        console.error("เชื่อมต่อระบบแจกสิทธิ์ผิดพลาด:", error);
    }
}

// 🌟 3. เติม credentials สำหรับฟังก์ชันล็อกเอาต์ด้วยเช่นกันครับ
async function logout() {
    if (confirm("คุณต้องการออกจากระบบใช่หรือไม่?")) {
        try {
            const response = await fetch('/api/users/logout', { 
                method: 'POST',
                credentials: 'include' 
            });
            const result = await response.json();
            if (result.success) {
                window.location.href = "Home.html";
            }
        } catch (error) {
            alert("เกิดข้อผิดพลาดในการออกจากระบบ");
        }
    }
}
// =========================================================================
// 🎯 สคริปต์เปลี่ยนทางเมนูบาร์: ส่งสัญญาณผ่าน URL Parameter ไปให้หน้าคอร์สเรียนกรองข้อมูล
// =========================================================================
document.addEventListener('click', (e) => {
    const megaBtn = e.target.closest('[data-mega-filter]');
    if (!megaBtn) return;

    const filterType = megaBtn.getAttribute('data-mega-filter') || megaBtn.dataset.megaFilter;
    
    // ดีดหน้าเว็บไปที่หน้า Courses พร้อมแนบตัวกรอง
    window.location.href = `Courses.html?filter=${filterType.toLowerCase()}`;
});
document.addEventListener('DOMContentLoaded', checkUserAndRenderNavbar);