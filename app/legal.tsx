import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/theme';

const OPERATOR_NAME = 'Давыдов Никита Сергеевич';
const OPERATOR_INN = '773423983287';
const OPERATOR_EMAIL = 'zpouches@yandex.ru';

const DOCS: Record<string, { title: string; sections: { heading?: string; body: string }[] }> = {
  terms: {
    title: 'Пользовательское соглашение',
    sections: [
      {
        body: `Пользовательское соглашение сервиса JobToo\n\nОператор: ${OPERATOR_NAME}\nИНН: ${OPERATOR_INN}\nEmail: ${OPERATOR_EMAIL}`,
      },
      {
        heading: '1. Общие положения',
        body: `1.1. Настоящее соглашение регулирует отношения между пользователем и оператором сервиса JobToo.\n1.2. Оператором является физическое лицо: ${OPERATOR_NAME} (ИНН: ${OPERATOR_INN}).\n1.3. Используя сервис, пользователь подтверждает согласие с настоящими условиями.`,
      },
      {
        heading: '2. Предмет соглашения',
        body: `2.1. Сервис предоставляет платформу для размещения вакансий и поиска подработки или постоянной работы.\n2.2. Сервис не является работодателем и не несёт ответственности за договорённости между пользователями.`,
      },
      {
        heading: '3. Регистрация',
        body: `3.1. Пользователь обязуется предоставлять достоверные данные.\n3.2. Один номер телефона — один аккаунт.`,
      },
      {
        heading: '4. Ответственность',
        body: `4.1. Пользователь несёт ответственность за свои действия на платформе.\n4.2. Оператор не гарантирует трудоустройство.`,
      },
      {
        heading: '5. Блокировка',
        body: `5.1. Оператор вправе заблокировать пользователя при нарушении правил платформы.`,
      },
      {
        heading: '6. Модерация и безопасность',
        body: `6.1. Оператор вправе проверять содержимое сообщений и иных материалов, размещённых пользователями, в целях обеспечения безопасности платформы, предотвращения мошенничества и соблюдения настоящих правил.\n6.2. Указанные действия осуществляются исключительно в рамках функционирования сервиса и не передаются третьим лицам.`,
      },
      {
        heading: '7. Заключительные положения',
        body: `7.1. Соглашение вступает в силу с момента принятия при регистрации.\n7.2. Оператор вправе изменять условия соглашения.`,
      },
    ],
  },
  privacy: {
    title: 'Политика конфиденциальности',
    sections: [
      {
        body: `Политика конфиденциальности сервиса JobToo\n\nОператор: ${OPERATOR_NAME}\nИНН: ${OPERATOR_INN}\nEmail: ${OPERATOR_EMAIL}`,
      },
      {
        heading: 'Собираемые данные',
        body: `• Номер телефона\n• Имя и фамилия\n• Данные профиля (метро, специализация, компания)\n• Технические данные (устройство, версия приложения)`,
      },
      {
        heading: 'Цели обработки',
        body: `• Регистрация и идентификация пользователя\n• Обеспечение работы сервиса\n• Связь с пользователем`,
      },
      {
        heading: 'Передача данных',
        body: `Персональные данные не передаются третьим лицам, кроме случаев, предусмотренных законодательством Российской Федерации (152-ФЗ «О персональных данных»).`,
      },
      {
        heading: 'Уведомления и рассылки',
        body: `Оператор вправе направлять пользователям уведомления, связанные с работой сервиса (push-уведомления, SMS), в том числе информационного характера. Пользователь вправе отказаться от уведомлений через настройки устройства или обратившись по email: ${OPERATOR_EMAIL}.`,
      },
      {
        heading: 'Хранение данных',
        body: `Данные хранятся до момента удаления аккаунта пользователем.`,
      },
      {
        heading: 'Права пользователя',
        body: `• Запрос сведений об обрабатываемых данных\n• Удаление данных через удаление аккаунта\n• Обращение по email: ${OPERATOR_EMAIL}`,
      },
    ],
  },
  consent: {
    title: 'Согласие на обработку персональных данных',
    sections: [
      {
        body: `Настоящим пользователь даёт согласие оператору ${OPERATOR_NAME} (ИНН: ${OPERATOR_INN}) на обработку своих персональных данных.`,
      },
      {
        heading: 'Перечень обрабатываемых данных',
        body: `• Номер телефона\n• Имя и фамилия\n• Данные профиля (метро, специализация, компания, фото)`,
      },
      {
        heading: 'Цели обработки',
        body: `• Использование сервиса JobToo\n• Взаимодействие между пользователями платформы\n• Обеспечение безопасности платформы и модерация контента\n• Направление уведомлений, связанных с работой сервиса (push-уведомления, SMS)`,
      },
      {
        heading: 'Срок действия согласия',
        body: `Согласие действует до удаления аккаунта пользователем.`,
      },
      {
        heading: 'Отзыв согласия',
        body: `Пользователь вправе отозвать согласие:\n• Через удаление аккаунта в приложении\n• Через обращение по email: ${OPERATOR_EMAIL}`,
      },
    ],
  },
};

export default function LegalScreen() {
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const content = doc ? DOCS[doc] : null;

  if (!content) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backTxt}>← Назад</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Документ</Text>
          <View style={{ width: 70 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: Colors.textMuted }}>Документ не найден</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← Назад</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{content.title}</Text>
        <View style={{ width: 70 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.docTitle}>{content.title}</Text>
        {content.sections.map((s, i) => (
          <View key={i} style={styles.section}>
            {s.heading ? <Text style={styles.heading}>{s.heading}</Text> : null}
            <Text style={styles.docBody}>{s.body}</Text>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { width: 70 },
  backTxt: { fontSize: 15, color: '#6B7280', fontWeight: '500' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1, textAlign: 'center' },
  body: { padding: 20, paddingBottom: 40, gap: 16 },
  docTitle: { fontSize: 20, fontWeight: '800', color: '#111827', lineHeight: 26 },
  section: { gap: 6 },
  heading: { fontSize: 15, fontWeight: '700', color: '#111827' },
  docBody: { fontSize: 15, color: '#374151', lineHeight: 24 },
});
