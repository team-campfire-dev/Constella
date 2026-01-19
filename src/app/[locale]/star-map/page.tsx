import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/DashboardLayout';
import StarGraph from '@/components/StarGraph';

export default function StarMapPage() {
    const t = useTranslations('StarMap');

    return (
        <DashboardLayout>
            <div className="p-6 h-full flex flex-col">
                <div className="mb-4">
                    <h1 className="text-xl font-bold text-gray-100">{t('cardTitle')}</h1>
                </div>
                <div className="flex-1 min-h-0">
                    <StarGraph />
                </div>
            </div>
        </DashboardLayout>
    );
}
